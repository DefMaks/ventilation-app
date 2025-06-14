import { Component } from '@angular/core';
import { ModalController } from '@ionic/angular';
import * as XLSX from 'xlsx';
import * as pdfjsLib from 'pdfjs-dist';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import { ExcelTemplateService, TransactionData } from '../services/excel-template.service';
import { CurrencyService } from '../services/currency.service';
import { CurrencyModalComponent } from '../components/currency-modal/currency-modal.component';
import { TransactionQuickviewComponent } from '../components/transaction-quickview/transaction-quickview.component';

// Configuration du worker
GlobalWorkerOptions.workerSrc =
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  standalone: false,
})
export class HomePage {
  transactions: TransactionData[] = [];
  isProcessing = false;
  validationErrors: string[] = [];
  currentExchangeRate: number = 2800;
  usdAmounts: TransactionData[] = []; // Store original USD amounts

  constructor(
    private excelTemplateService: ExcelTemplateService,
    private currencyService: CurrencyService,
    private modalController: ModalController
  ) {
    // Load stored exchange rate on initialization
    const storedRate = this.currencyService.getStoredRate();
    if (storedRate) {
      this.currentExchangeRate = storedRate.rate;
    }
  }

  async onFileSelected(event: any) {
    const file = event.target.files[0];
    if (!file) return;

    this.isProcessing = true;
    this.validationErrors = [];

    try {
      console.log('Processing file:', file.name);
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await getDocument({ data: arrayBuffer }).promise;
      const result: TransactionData[] = [];

      // Pattern optimisé pour vos besoins
      const targetDesignations = [
        'PYT FPT',
        'TRSF',
        'PMT TOURISME',
        'FPT INVESTISSEMENT',
        'ONT FICHE STATISTIQUES',
        'APPUI ADM DU TOURISME',
        'ICCN',
        'SITE TOURISTIQUE',
        'COMITE DE SUIVI ET VALIDATION',
        'ONT CONTROLE ET INSPECTION DES UNITES TOURISTIQUES',
      ];
      const designationPattern = targetDesignations.join('|');

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const text = content.items.map((item: any) => item.str).join(' ');

        // Regex améliorée pour capturer débit OU crédit
        const transactionRegex = new RegExp(
          `(\\d{2}-\\d{2}-\\d{4}).*?(${designationPattern}).*?` +
            `(?:([\\d,.]+)\\s*(?:\\s([\\d,.]+))?)`, // Capture débit et crédit séparément
          'gi'
        );

        let match;
        while ((match = transactionRegex.exec(text)) !== null) {
          // Détermine si le montant est en débit ou crédit
          const debit = match[3]
            ? parseFloat(match[3].replace(/[^\d.-]/g, ''))
            : 0;
          const credit = match[4]
            ? parseFloat(match[4].replace(/[^\d.-]/g, ''))
            : 0;
          const montant = debit !== 0 ? -debit : credit; // Montant négatif si débit

          result.push({
            date: match[1],
            designation: match[2],
            debit: debit,
            credit: credit,
            montant: montant, // Valeur signée (négative pour débits)
          });
        }
      }

      console.log('Transactions extraites (USD):', result);
      
      // Store original USD amounts
      this.usdAmounts = [...result];
      
      // Check if we need to ask for exchange rate
      if (result.length > 0) {
        await this.handleCurrencyConversion(result);
      } else {
        this.transactions = result;
      }

      // Validate extracted data
      const validation = this.excelTemplateService.validateData(this.transactions);
      if (!validation.isValid) {
        this.validationErrors = validation.errors;
        console.warn('Erreurs de validation:', validation.errors);
      }

    } catch (error) {
      console.error('Erreur de traitement PDF:', error);
      this.validationErrors = ['Erreur lors du traitement du PDF: ' + (error as Error).message];
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Handle currency conversion from USD to CDF
   */
  private async handleCurrencyConversion(usdTransactions: TransactionData[]): Promise<void> {
    let exchangeRate = this.currentExchangeRate;

    // Check if we should ask for rate
    if (this.currencyService.shouldAskForRate()) {
      const modal = await this.modalController.create({
        component: CurrencyModalComponent,
        componentProps: {
          currentRate: this.currentExchangeRate
        },
        backdropDismiss: false
      });

      await modal.present();
      const { data } = await modal.onDidDismiss();

      if (data && data.rate) {
        exchangeRate = data.rate;
        this.currentExchangeRate = data.rate;
        
        // Save the rate if user confirmed
        this.currencyService.saveRate(data.rate, data.dontAskAgain);
      }
    }

    // Convert all transactions from USD to CDF
    this.transactions = usdTransactions.map(transaction => ({
      ...transaction,
      debit: transaction.debit > 0 ? this.currencyService.convertUsdToCdf(transaction.debit, exchangeRate) : 0,
      credit: transaction.credit > 0 ? this.currencyService.convertUsdToCdf(transaction.credit, exchangeRate) : 0,
      montant: this.currencyService.convertUsdToCdf(transaction.montant, exchangeRate)
    }));

    console.log(`Transactions converties (USD → CDF au taux ${exchangeRate}):`, this.transactions);
  }

  exportToExcel() {
    if (this.transactions.length === 0) {
      console.warn('Aucune transaction à exporter');
      return;
    }

    try {
      // Create Excel template with converted CDF data
      this.excelTemplateService.createExcelTemplate(this.transactions);
      console.log('Template Excel créé avec succès');
    } catch (error) {
      console.error('Erreur lors de la création du template Excel:', error);
    }
  }

  exportToExcelLegacy() {
    // Keep the original export functionality as backup
    const syntheseMap = new Map<string, number>();
    this.transactions.forEach((t) => {
      const total = syntheseMap.get(t.designation) || 0;
      syntheseMap.set(t.designation, total + t.montant);
    });

    const synthese = Array.from(syntheseMap.entries()).map(
      ([designation, montant]) => ({ designation, montant })
    );

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(synthese),
      'Synthèse'
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(this.transactions),
      'Détails'
    );
    XLSX.writeFile(wb, 'ventilation_2024_legacy.xlsx');
  }

  async onTemplateFileSelected(event: any) {
    const file = event.target.files[0];
    if (!file || this.transactions.length === 0) {
      console.warn('Veuillez d\'abord traiter un PDF et sélectionner un template Excel');
      return;
    }

    this.isProcessing = true;

    try {
      await this.excelTemplateService.updateExcelTemplate(file, this.transactions);
      console.log('Template Excel mis à jour avec succès');
    } catch (error) {
      console.error('Erreur lors de la mise à jour du template:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  clearData() {
    this.transactions = [];
    this.usdAmounts = [];
    this.validationErrors = [];
  }

  getSummaryByDesignation() {
    const summaryMap = new Map<string, { count: number; total: number; totalUsd: number }>();
    
    this.transactions.forEach((t, index) => {
      const existing = summaryMap.get(t.designation) || { count: 0, total: 0, totalUsd: 0 };
      const originalUsdAmount = this.usdAmounts[index] ? Math.abs(this.usdAmounts[index].montant) : 0;
      
      summaryMap.set(t.designation, {
        count: existing.count + 1,
        total: existing.total + Math.abs(t.montant),
        totalUsd: existing.totalUsd + originalUsdAmount
      });
    });

    return Array.from(summaryMap.entries()).map(([designation, data]) => ({
      designation,
      count: data.count,
      total: data.total,
      totalUsd: data.totalUsd
    }));
  }

  /**
   * Reset exchange rate settings (for testing)
   */
  resetExchangeRate() {
    this.currencyService.clearStoredRate();
    this.currentExchangeRate = 2800;
    console.log('Taux de change réinitialisé');
  }

  /**
   * Manually change exchange rate
   */
  async changeExchangeRate() {
    const modal = await this.modalController.create({
      component: CurrencyModalComponent,
      componentProps: {
        currentRate: this.currentExchangeRate
      }
    });

    await modal.present();
    const { data } = await modal.onDidDismiss();

    if (data && data.rate && this.usdAmounts.length > 0) {
      this.currentExchangeRate = data.rate;
      this.currencyService.saveRate(data.rate, data.dontAskAgain);
      
      // Reconvert transactions with new rate
      this.transactions = this.usdAmounts.map(transaction => ({
        ...transaction,
        debit: transaction.debit > 0 ? this.currencyService.convertUsdToCdf(transaction.debit, data.rate) : 0,
        credit: transaction.credit > 0 ? this.currencyService.convertUsdToCdf(transaction.credit, data.rate) : 0,
        montant: this.currencyService.convertUsdToCdf(transaction.montant, data.rate)
      }));

      console.log(`Transactions reconverties au nouveau taux ${data.rate}:`, this.transactions);
    }
  }

  /**
   * Check if amount is suspicious (over 1M CDF)
   */
  isSuspiciousAmount(amount: number): boolean {
    return Math.abs(amount) > 1000000; // Amounts over 1M CDF are suspicious
  }

  /**
   * Open transaction quickview modal
   */
  async openTransactionQuickview(designation: string) {
    // Filter transactions by designation
    const filteredTransactions = this.transactions.filter(t => t.designation === designation);
    const filteredUsdAmounts = this.usdAmounts.filter(t => t.designation === designation);
    
    // Calculate totals
    const totalAmount = filteredTransactions.reduce((sum, t) => sum + Math.abs(t.montant), 0);
    const totalUsdAmount = filteredUsdAmounts.reduce((sum, t) => sum + Math.abs(t.montant), 0);

    const modal = await this.modalController.create({
      component: TransactionQuickviewComponent,
      componentProps: {
        transactions: filteredTransactions,
        usdAmounts: filteredUsdAmounts,
        exchangeRate: this.currentExchangeRate,
        designation: designation,
        totalAmount: totalAmount,
        totalUsdAmount: totalUsdAmount
      },
      cssClass: 'transaction-quickview-modal'
    });

    await modal.present();
  }
}