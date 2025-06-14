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

interface TableColumn {
  label: string;
  minX: number;
  maxX: number;
  index: number;
}

interface ParsedRow {
  transactionDate: string;
  valueDate: string;
  narrative: string;
  debit: number;
  credit: number;
}

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

  // Define table columns based on typical bank statement layout
  private tableColumns: TableColumn[] = [
    { label: 'Transaction Date', minX: 0, maxX: 100, index: 0 },
    { label: 'Value Date', minX: 100, maxX: 200, index: 1 },
    { label: 'Narrative', minX: 200, maxX: 500, index: 2 },
    { label: 'Debit', minX: 500, maxX: 600, index: 3 },
    { label: 'Credit', minX: 600, maxX: 1000, index: 4 }
  ];

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

      // Target designations we're looking for
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

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        
        // Get text with position information
        const textItems = content.items.map((item: any) => ({
          str: item.str.trim(),
          x: item.transform[4],
          y: item.transform[5],
          width: item.width || 0
        })).filter(item => item.str.length > 0);

        console.log(`Page ${i} - Found ${textItems.length} text items`);

        // Auto-detect column boundaries based on text positions
        const detectedColumns = this.detectColumnBoundaries(textItems);
        console.log('Detected columns:', detectedColumns);

        // Group text items by Y position (rows) with tolerance
        const rows = this.groupTextIntoRows(textItems);
        console.log(`Page ${i} - Found ${rows.length} rows`);

        // Process each row and map to columns
        for (const rowItems of rows) {
          const parsedRow = this.parseRowToColumns(rowItems, detectedColumns);
          
          if (!parsedRow) continue;

          console.log('Parsed row:', parsedRow);

          // Check if this row contains a valid transaction
          if (!this.isValidTransactionRow(parsedRow, targetDesignations)) {
            continue;
          }

          // Convert to our transaction format
          const transaction: TransactionData = {
            date: parsedRow.transactionDate,
            designation: this.findMatchingDesignation(parsedRow.narrative, targetDesignations),
            debit: parsedRow.debit,
            credit: parsedRow.credit,
            montant: parsedRow.credit > 0 ? parsedRow.credit : -parsedRow.debit
          };

          result.push(transaction);
          console.log(`Added transaction:`, transaction);
        }
      }

      console.log('Total transactions extracted:', result.length);
      
      // Store original USD amounts and display them directly
      this.usdAmounts = [...result];
      this.transactions = [...result];
      
      // Validate extracted data
      const validation = this.excelTemplateService.validateData(this.transactions);
      if (!validation.isValid) {
        this.validationErrors = validation.errors;
        console.warn('Validation errors:', validation.errors);
      }

    } catch (error) {
      console.error('PDF processing error:', error);
      this.validationErrors = ['Error processing PDF: ' + (error as Error).message];
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Auto-detect column boundaries based on text positions
   */
  private detectColumnBoundaries(textItems: any[]): TableColumn[] {
    // Find potential column separators by analyzing X positions
    const xPositions = textItems.map(item => item.x).sort((a, b) => a - b);
    const uniqueX = [...new Set(xPositions)];
    
    // Group similar X positions (within tolerance)
    const tolerance = 10;
    const columnStarts: number[] = [];
    
    for (let i = 0; i < uniqueX.length; i++) {
      const x = uniqueX[i];
      const isNewColumn = !columnStarts.some(start => Math.abs(start - x) <= tolerance);
      if (isNewColumn) {
        columnStarts.push(x);
      }
    }
    
    columnStarts.sort((a, b) => a - b);
    console.log('Detected column starts:', columnStarts);

    // Create column definitions
    const columns: TableColumn[] = [];
    const labels = ['Transaction Date', 'Value Date', 'Narrative', 'Debit', 'Credit'];
    
    for (let i = 0; i < Math.min(columnStarts.length, labels.length); i++) {
      const minX = columnStarts[i];
      const maxX = i < columnStarts.length - 1 ? columnStarts[i + 1] : 1000;
      
      columns.push({
        label: labels[i],
        minX: minX,
        maxX: maxX,
        index: i
      });
    }

    return columns;
  }

  /**
   * Group text items into rows based on Y position
   */
  private groupTextIntoRows(textItems: any[]): any[][] {
    const rows = new Map<number, any[]>();
    const yTolerance = 5;

    textItems.forEach(item => {
      let foundRow = false;
      for (const [y, items] of rows.entries()) {
        if (Math.abs(y - item.y) <= yTolerance) {
          items.push(item);
          foundRow = true;
          break;
        }
      }
      if (!foundRow) {
        rows.set(item.y, [item]);
      }
    });

    // Sort rows by Y position (top to bottom) and items within rows by X position
    return Array.from(rows.entries())
      .sort((a, b) => b[0] - a[0]) // Descending Y (top to bottom)
      .map(([y, items]) => items.sort((a, b) => a.x - b.x));
  }

  /**
   * Parse a row of text items into column-based data
   */
  private parseRowToColumns(rowItems: any[], columns: TableColumn[]): ParsedRow | null {
    const columnData: string[] = new Array(columns.length).fill('');
    
    // Assign each text item to its appropriate column
    rowItems.forEach(item => {
      for (const column of columns) {
        if (item.x >= column.minX && item.x < column.maxX) {
          if (columnData[column.index]) {
            columnData[column.index] += ' ' + item.str;
          } else {
            columnData[column.index] = item.str;
          }
          break;
        }
      }
    });

    // Clean up column data
    const cleanedData = columnData.map(data => data.trim());
    
    console.log('Column data:', cleanedData);

    // Parse the data according to expected column structure
    const transactionDate = this.extractDate(cleanedData[0]) || this.extractDate(cleanedData[1]);
    const valueDate = this.extractDate(cleanedData[1]) || transactionDate;
    const narrative = cleanedData[2] || '';
    const debit = this.parseAmount(cleanedData[3]) || 0;
    const credit = this.parseAmount(cleanedData[4]) || 0;

    // If we have amounts in wrong columns, try to detect them
    if (debit === 0 && credit === 0) {
      // Look for amounts in any column
      for (let i = 0; i < cleanedData.length; i++) {
        const amount = this.parseAmount(cleanedData[i]);
        if (amount > 0) {
          // Heuristic: if it's in the last columns, it's likely credit
          if (i >= 3) {
            return {
              transactionDate: transactionDate || '',
              valueDate: valueDate || '',
              narrative: narrative,
              debit: 0,
              credit: amount
            };
          } else if (i >= 2) {
            return {
              transactionDate: transactionDate || '',
              valueDate: valueDate || '',
              narrative: narrative,
              debit: amount,
              credit: 0
            };
          }
        }
      }
    }

    if (!transactionDate && !narrative) {
      return null; // Not a valid data row
    }

    return {
      transactionDate: transactionDate || '',
      valueDate: valueDate || '',
      narrative: narrative,
      debit: debit,
      credit: credit
    };
  }

  /**
   * Extract date from text using various patterns
   */
  private extractDate(text: string): string | null {
    if (!text) return null;
    
    const datePatterns = [
      /(\d{2}-\d{2}-\d{4})/,
      /(\d{2}\/\d{2}\/\d{4})/,
      /(\d{2}\.\d{2}\.\d{4})/
    ];

    for (const pattern of datePatterns) {
      const match = text.match(pattern);
      if (match) {
        return match[1];
      }
    }
    
    return null;
  }

  /**
   * Check if a parsed row represents a valid transaction
   */
  private isValidTransactionRow(row: ParsedRow, targetDesignations: string[]): boolean {
    // Must have a date
    if (!row.transactionDate) return false;
    
    // Must have either debit or credit amount
    if (row.debit === 0 && row.credit === 0) return false;
    
    // Must contain one of our target designations
    return this.findMatchingDesignation(row.narrative, targetDesignations) !== '';
  }

  /**
   * Find matching designation from narrative text
   */
  private findMatchingDesignation(narrative: string, targetDesignations: string[]): string {
    const upperNarrative = narrative.toUpperCase();
    
    for (const designation of targetDesignations) {
      if (upperNarrative.includes(designation.toUpperCase())) {
        return designation;
      }
    }
    
    return '';
  }

  /**
   * Parse amount string with commas and decimals (e.g., "34,736.28")
   */
  private parseAmount(amountStr: string): number {
    if (!amountStr) return 0;
    
    // Remove any non-digit, non-comma, non-decimal characters
    const cleanAmount = amountStr.replace(/[^\d,.-]/g, '');
    
    if (!cleanAmount) return 0;
    
    // Handle different formats:
    // "34,736.28" -> 34736.28
    // "1,234,567.89" -> 1234567.89
    // "1234.56" -> 1234.56
    
    // If there's a decimal point, split on it
    if (cleanAmount.includes('.')) {
      const parts = cleanAmount.split('.');
      const integerPart = parts[0].replace(/,/g, ''); // Remove all commas from integer part
      const decimalPart = parts[1];
      const result = parseFloat(`${integerPart}.${decimalPart}`);
      return isNaN(result) ? 0 : result;
    } else {
      // No decimal point, just remove commas
      const result = parseFloat(cleanAmount.replace(/,/g, ''));
      return isNaN(result) ? 0 : result;
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
      console.warn('No transactions to export');
      return;
    }

    try {
      // Convert to CDF for export only
      const convertedTransactions = await this.handleCurrencyConversionForExport();
      
      // Create Excel template with converted CDF data
      this.excelTemplateService.createExcelTemplate(convertedTransactions);
      console.log('Excel template created successfully');
    } catch (error) {
      console.error('Error creating Excel template:', error);
    }
  }

  async exportToExcelLegacy() {
    if (this.transactions.length === 0) {
      console.warn('No transactions to export');
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
      console.error('Error in legacy export:', error);
    }
  }

  async onTemplateFileSelected(event: any) {
    const file = event.target.files[0];
    if (!file || this.transactions.length === 0) {
      console.warn('Please process a PDF first and select an Excel template');
      return;
    }

    this.isProcessing = true;

    try {
      // Convert to CDF for template update
      const convertedTransactions = await this.handleCurrencyConversionForExport();
      
      await this.excelTemplateService.updateExcelTemplate(file, convertedTransactions);
      console.log('Excel template updated successfully');
    } catch (error) {
      console.error('Error updating Excel template:', error);
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
    console.log('Exchange rate reset');
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
      
      console.log(`New exchange rate configured: ${data.rate} CDF for 1 USD`);
      console.log('This rate will be used for the next export');
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