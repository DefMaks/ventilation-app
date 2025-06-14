import { Injectable } from '@angular/core';
import * as XLSX from 'xlsx';

export interface TransactionData {
  date: string;
  designation: string;
  debit: number;
  credit: number;
  montant: number;
}

export interface ExcelTemplateData {
  reportDate: string;
  receiptsFromJanToDec: number;
  totalReceipts: number;
  accountData: {
    [key: string]: number;
  };
}

@Injectable({
  providedIn: 'root'
})
export class ExcelTemplateService {

  constructor() { }

  /**
   * Creates Excel template with exact structure from PDF template
   */
  createExcelTemplate(transactions: TransactionData[]): void {
    // Create a new workbook
    const wb = XLSX.utils.book_new();
    
    // Create the main worksheet data based on PDF template
    const wsData = this.createTemplateFromPDF(transactions);
    
    // Convert to worksheet
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    
    // Set column widths to match PDF layout
    ws['!cols'] = [
      { width: 8 },   // Column A (N° CPTE)
      { width: 65 },  // Column B (DESIGNATION) - wider for long text
      { width: 18 },  // Column C (MONTANT)
      { width: 12 },  // Column D
      { width: 12 },  // Column E
      { width: 12 }   // Column F
    ];

    // Format cells for better appearance
    this.formatWorksheet(ws);

    // Add the worksheet to workbook
    XLSX.utils.book_append_sheet(wb, ws, 'VENTILATION');
    
    // Save the file
    XLSX.writeFile(wb, 'ONT_VENTILATION_2024.xlsx');
  }

  /**
   * Creates template data structure exactly matching the PDF
   */
  private createTemplateFromPDF(transactions: TransactionData[]): any[][] {
    // Process transactions to get aggregated data
    const processedData = this.processTransactions(transactions);
    
    const data: any[][] = [];
    
    // Row 1: REPUBLIQUE DEMOCRATIQUE DU CONGO
    data.push(['REPUBLIQUE DEMOCRATIQUE DU CONGO', '', '', '', '', '']);
    
    // Row 2: OFFICE NATIONAL DU TOURISME
    data.push(['OFFICE NATIONAL DU TOURISME', '', '', '', '', '']);
    
    // Row 3: DIRECTION FINANCIERE
    data.push(['DIRECTION FINANCIERE', '', '', '', '', '']);
    
    // Row 4: Empty
    data.push(['', '', '', '', '', '']);
    
    // Row 5: Empty
    data.push(['', '', '', '', '', '']);
    
    // Row 6: Title
    data.push(['VENTILATION DES DEPENSES DU FONDS DE PROMOTION DU TOURISME EXERCICE 2024', '', '', '', '', '']);
    
    // Row 7: Empty
    data.push(['', '', '', '', '', '']);
    
    // Row 8: Headers
    data.push(['N°', 'DESIGNATION', 'MONTANT', '', '', '']);
    
    // Row 9: CPTE
    data.push(['CPTE', '', '', '', '', '']);
    
    // Row 10: Empty
    data.push(['', '', '', '', '', '']);
    
    // Row 11: Empty
    data.push(['', '', '', '', '', '']);
    
    // Row 12: ENTREES
    data.push(['', 'ENTREES', '', '', '', '']);
    
    // Row 13: REPORT AU 01 JANVIER 2024
    data.push(['', 'REPORT AU 01 JANVIER 2024', 13298589.15, '', '', '']);
    
    // Row 14: RECETTES DU FPT
    data.push(['', 'RECETTES DU FPT REALISE DU 01 JANVIER AU 31 DEC 2024', processedData.totalReceipts, '', '', '']);
    
    // Row 15: Empty
    data.push(['', '', '', '', '', '']);
    
    // Row 16: TOTAL RECETTES (Formula)
    data.push(['', 'TOTAL RECETTES', { f: 'C13+C14' }, '', '', '']);
    
    // Row 17: Empty
    data.push(['', '', '', '', '', '']);
    
    // Row 18: Empty
    data.push(['', '', '', '', '', '']);
    
    // Row 19: Account 60 - 1.Achat et variation de stock (Formula)
    data.push(['60', '1.Achat et variation de stock', { f: 'SUM(C20:C26)' }, '', '', '']);
    
    // Row 20: • Eau
    data.push(['', '• Eau', this.getExtractedValue(processedData, 'EAU'), '', '', '']);
    
    // Row 21: • Electricité
    data.push(['', '• Electricité', this.getExtractedValue(processedData, 'ELECTRICITE'), '', '', '']);
    
    // Row 22: • Carburant
    data.push(['', '• Carburant', this.getExtractedValue(processedData, 'CARBURANT'), '', '', '']);
    
    // Row 23: • Produits d'entretien
    data.push(['', '• Produits d\'entretien', this.getExtractedValue(processedData, 'PRODUITS_ENTRETIEN'), '', '', '']);
    
    // Row 24: • Fournitures de bureau et consommables informatiques
    data.push(['', '• Fournitures de bureau et consommables informatiques', this.getExtractedValue(processedData, 'FOURNITURES'), '', '', '']);
    
    // Row 25: • Achat petits matériels et outillages
    data.push(['', '• Achat petits matériels et outillages', this.getExtractedValue(processedData, 'PETITS_MATERIELS'), '', '', '']);
    
    // Row 26: • Fonctionnement
    data.push(['', '• Fonctionnement', this.getExtractedValue(processedData, 'FONCTIONNEMENT'), '', '', '']);
    
    // Row 27: Account 61 - 2. Transport
    data.push(['61', '2. Transport', this.getExtractedValue(processedData, 'TRANSPORT'), '', '', '']);

    // Continue with more rows as needed based on the PDF structure
    // Add more account categories if they exist in the PDF

    return data;
  }

  /**
   * Get extracted value from PDF data, default to 0 if not found
   */
  private getExtractedValue(processedData: ExcelTemplateData, key: string): number {
    return processedData.accountData[key] || 0;
  }

  /**
   * Format worksheet cells for better appearance
   */
  private formatWorksheet(ws: XLSX.WorkSheet): void {
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:F50');
    
    for (let R = range.s.r; R <= range.e.r; ++R) {
      for (let C = range.s.c; C <= range.e.c; ++C) {
        const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
        if (!ws[cellAddress]) continue;
        
        // Format column C (amounts) as numbers with 2 decimal places
        if (C === 2 && typeof ws[cellAddress].v === 'number') {
          ws[cellAddress].z = '#,##0.00';
        }
        
        // Bold headers
        if (R === 0 || R === 1 || R === 2 || R === 5 || R === 7) {
          if (!ws[cellAddress].s) ws[cellAddress].s = {};
          ws[cellAddress].s.font = { bold: true };
        }
        
        // Center align headers
        if (R <= 7) {
          if (!ws[cellAddress].s) ws[cellAddress].s = {};
          ws[cellAddress].s.alignment = { horizontal: 'center' };
        }
      }
    }
  }

  /**
   * Process transactions and map to account categories
   */
  private processTransactions(transactions: TransactionData[]): ExcelTemplateData {
    const accountData: { [key: string]: number } = {};
    let totalReceipts = 0;
    
    // Enhanced mapping based on common accounting categories
    const designationMapping: { [key: string]: string } = {
      'PMT TOURISME': 'PMT_TOURISME',
      'FPT INVESTISSEMENT': 'FPT_INVESTISSEMENT', 
      'ONT FICHE STATISTIQUES': 'ONT_STATISTIQUES',
      'APPUI ADM DU TOURISME': 'APPUI_TOURISME',
      'ICCN': 'ICCN',
      'SITE TOURISTIQUE': 'SITE_TOURISTIQUE',
      'COMITE DE SUIVI ET VALIDATION': 'COMITE_SUIVI',
      'ONT CONTROLE ET INSPECTION DES UNITES TOURISTIQUES': 'ONT_CONTROLE',
      
      // Map to specific account categories based on keywords
      'EAU': 'EAU',
      'ELECTRICITE': 'ELECTRICITE', 
      'CARBURANT': 'CARBURANT',
      'ENTRETIEN': 'PRODUITS_ENTRETIEN',
      'FOURNITURE': 'FOURNITURES',
      'MATERIEL': 'PETITS_MATERIELS',
      'FONCTIONNEMENT': 'FONCTIONNEMENT',
      'TRANSPORT': 'TRANSPORT'
    };

    // Process each transaction
    transactions.forEach(transaction => {
      let mappedKey = null;
      
      // First try exact match
      mappedKey = designationMapping[transaction.designation];
      
      // If no exact match, try keyword matching
      if (!mappedKey) {
        for (const [keyword, category] of Object.entries(designationMapping)) {
          if (transaction.designation.toUpperCase().includes(keyword.toUpperCase())) {
            mappedKey = category;
            break;
          }
        }
      }
      
      if (mappedKey) {
        if (!accountData[mappedKey]) {
          accountData[mappedKey] = 0;
        }
        accountData[mappedKey] += Math.abs(transaction.montant);
      }
      
      // Add to total receipts regardless of mapping
      totalReceipts += Math.abs(transaction.montant);
    });

    return {
      reportDate: new Date().toLocaleDateString('fr-FR'),
      receiptsFromJanToDec: totalReceipts,
      totalReceipts: totalReceipts,
      accountData: accountData
    };
  }

  /**
   * Updates existing Excel template with new data
   */
  updateExcelTemplate(file: File, transactions: TransactionData[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          
          // Get the first worksheet
          const worksheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[worksheetName];
          
          // Process transactions
          const processedData = this.processTransactions(transactions);
          
          // Update specific cells with extracted data
          this.updateWorksheetCells(worksheet, processedData);
          
          // Save the updated file
          XLSX.writeFile(workbook, 'ONT_VENTILATION_2024_Updated.xlsx');
          resolve();
        } catch (error) {
          reject(error);
        }
      };
      
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsArrayBuffer(file);
    });
  }

  /**
   * Updates specific cells in the worksheet with extracted data
   */
  private updateWorksheetCells(worksheet: XLSX.WorkSheet, data: ExcelTemplateData): void {
    // Update C14 - Total receipts from extracted transactions
    worksheet['C14'] = { t: 'n', v: data.totalReceipts };
    
    // Update C16 - Formula for total receipts (C13+C14)
    worksheet['C16'] = { t: 'n', f: 'C13+C14' };
    
    // Update C19 - Formula for account 60 total (SUM(C20:C26))
    worksheet['C19'] = { t: 'n', f: 'SUM(C20:C26)' };
    
    // Update individual account items with extracted data (default to 0)
    const accountMappings = [
      { cell: 'C20', key: 'EAU' },
      { cell: 'C21', key: 'ELECTRICITE' },
      { cell: 'C22', key: 'CARBURANT' },
      { cell: 'C23', key: 'PRODUITS_ENTRETIEN' },
      { cell: 'C24', key: 'FOURNITURES' },
      { cell: 'C25', key: 'PETITS_MATERIELS' },
      { cell: 'C26', key: 'FONCTIONNEMENT' },
      { cell: 'C27', key: 'TRANSPORT' }
    ];
    
    accountMappings.forEach(mapping => {
      const value = data.accountData[mapping.key] || 0;
      worksheet[mapping.cell] = { t: 'n', v: value };
    });
  }

  /**
   * Validates extracted data
   */
  validateData(transactions: TransactionData[]): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    if (!transactions || transactions.length === 0) {
      errors.push('Aucune transaction trouvée dans le PDF');
      return { isValid: false, errors };
    }
    
    // Check for reasonable amounts
    transactions.forEach((transaction, index) => {
      if (Math.abs(transaction.montant) > 10000000000) { // 10 billion limit
        errors.push(`Montant suspect à la ligne ${index + 1}: ${transaction.montant.toLocaleString()} FC`);
      }
      
      if (!transaction.date || !transaction.designation) {
        errors.push(`Données incomplètes à la ligne ${index + 1}`);
      }
    });
    
    // Check total amount
    const totalAmount = transactions.reduce((sum, t) => sum + Math.abs(t.montant), 0);
    if (totalAmount === 0) {
      errors.push('Aucun montant valide trouvé dans les transactions');
    }
    
    return {
      isValid: errors.length === 0,
      errors: errors
    };
  }
}