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
        
        // Enhanced regex to capture amounts with commas and decimals
        // Look for patterns like: date designation amount1 amount2 (where amount2 might be balance)
        const transactionRegex = new RegExp(
          `(\\d{2}-\\d{2}-\\d{4}).*?(${designationPattern}).*?` +
            `([\\d,]+\\.\\d{2})(?:\\s+([\\d,]+\\.\\d{2}))?`, // Two amounts: debit/credit and possibly balance
          'gi'
        );

        let match;
        while ((match = transactionRegex.exec(text)) !== null) {
          const amount1 = this.parseAmount(match[3]);
          const amount2 = match[4] ? this.parseAmount(match[4]) : 0;
          
          // Logic to determine if it's a debit or credit
          // In bank statements, typically:
          // - If there's only one amount, check context or assume it's a debit (expense)
          // - If there are two amounts, the first is usually the transaction amount, second is balance
          
          let debit = 0;
          let credit = 0;
          let montant = 0;
          
          // For now, let's assume single amounts are debits (expenses) since this is an expense tracking system
          // You may need to adjust this logic based on your specific PDF format
          if (amount2 === 0) {
            // Single amount - assume it's a debit (expense)
            debit = amount1;
            credit = 0;
            montant = -amount1; // Negative for debit
          } else {
            // Two amounts - need to determine which is debit/credit based on context
            // This might need adjustment based on your PDF format
            debit = amount1;
            credit = 0;
            montant = -amount1; // Negative for debit
          }

          result.push({
            date: match[1],
            designation: match[2],
            debit: debit,
            credit: credit,
            montant: montant,
          });
        }
      }

      console.log('Transactions extraites (USD):', result);
      
      // Store original USD amounts and display them directly (no conversion)
      this.usdAmounts = [...result];
      this.transactions = [...result]; // Display USD amounts directly
      
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
   * Parse amount string with commas and decimals (e.g., "34,736.28")
   */
  private parseAmount(amountStr: string): number {
    if (!amountStr) return 0;
    
    // Remove any non-digit, non-comma, non-decimal characters
    const cleanAmount = amountStr.replace(/[^\d,.-]/g, '');
    
    // Handle different formats:
    // "34,736.28" -> 34736.28
    // "1,234,567.89" -> 1234567.89
    // "1234.56" -> 1234.56
    
    // If there's a decimal point, split on it
    if (cleanAmount.includes('.')) {
      const parts = cleanAmount.split('.');
      const integerPart = parts[0].replace(/,/g, ''); // Remove all commas from integer part
      const decimalPart = parts[1];
      return parseFloat(`${integerPart}.${decimalPart}`);
    } else {
      // No decimal point, just remove commas
      return parseFloat(cleanAmount.replace(/,/g, ''));
    }
  }

  /**
   * Handle currency conversion for export only
   */
  private async handleCurrencyConversionForExport(): Promise<TransactionData[]> {
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

    // Convert all transactions from USD to CDF for export
    return this.usdAmounts.map(transaction => ({
      ...transaction,
      debit: transaction.debit > 0 ? this.currencyService.convertUsdToCdf(transaction.debit, exchangeRate) : 0,
      credit: transaction.credit > 0 ? this.currencyService.convertUsdToCdf(transaction.credit, exchangeRate) : 0,
      montant: this.currencyService.convertUsdToCdf(transaction.montant, exchangeRate)
    }));
  }

  async exportToExcel() {
    if (this.transactions.length === 0) {
      console.warn('Aucune transaction à exporter');
      return;
    }

    try {
      // Convert to CDF for export only
      const convertedTransactions = await this.handleCurrencyConversionForExport();
      
      // Create Excel template with converted CDF data
      this.excelTemplateService.createExcelTemplate(convertedTransactions);
      console.log('Template Excel créé avec succès');
    } catch (error) {
      console.error('Erreur lors de la création du template Excel:', error);
    }
  }

  async exportToExcelLegacy() {
    if (this.transactions.length === 0) {
      console.warn('Aucune transaction à exporter');
      return;
    }

    try {
      // Convert to CDF for export only
      const convertedTransactions = await this.handleCurrencyConversionForExport();
      
      // Keep the original export functionality as backup
      const syntheseMap = new Map<string, number>();
      convertedTransactions.forEach((t) => {
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
        XLSX.utils.json_to_sheet(convertedTransactions),
        'Détails'
      );
      XLSX.writeFile(wb, 'ventilation_2024_legacy.xlsx');
    } catch (error) {
      console.error('Erreur lors de l\'export legacy:', error);
    }
  }

  async onTemplateFileSelected(event: any) {
    const file = event.target.files[0];
    if (!file || this.transactions.length === 0) {
      console.warn('Veuillez d\'abord traiter un PDF et sélectionner un template Excel');
      return;
    }

    this.isProcessing = true;

    try {
      // Convert to CDF for template update
      const convertedTransactions = await this.handleCurrencyConversionForExport();
      
      await this.excelTemplateService.updateExcelTemplate(file, convertedTransactions);
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
        total: existing.total + Math.abs(t.montant), // USD amounts for display
        totalUsd: existing.totalUsd + originalUsdAmount
      });
    });

    return Array.from(summaryMap.entries()).map(([designation, data]) => ({
      designation,
      count: data.count,
      total: data.total, // This will be USD since we're not converting for display
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
   * Manually change exchange rate (for export settings)
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

    if (data && data.rate) {
      this.currentExchangeRate = data.rate;
      this.currencyService.saveRate(data.rate, data.dontAskAgain);
      
      console.log(`Nouveau taux de change configuré: ${data.rate} CDF pour 1 USD`);
      console.log('Ce taux sera utilisé lors du prochain export');
    }
  }

  /**
   * Check if amount is suspicious (over 100K USD)
   */
  isSuspiciousAmount(amount: number): boolean {
    return Math.abs(amount) > 100000; // Amounts over 100K USD are suspicious
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

  /**
   * Format currency with English number syntax
   */
  public formatCurrency(amount: number, currency: string = 'USD'): string {
    if (currency === 'CDF') {
      return `${amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} ${currency}`;
    } else {
      return `${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
    }
  }

  /**
   * Format number with English syntax
   */
  public formatNumber(value: number, decimals: number = 2): string {
    return value.toLocaleString('en-US', { 
      minimumFractionDigits: decimals, 
      maximumFractionDigits: decimals 
    });
  }
}