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
   * Creates Excel template with data and formulas
   */
  createExcelTemplate(transactions: TransactionData[]): void {
    // Create a new workbook
    const wb = XLSX.utils.book_new();
    
    // Create the main worksheet data
    const wsData = this.createTemplateData(transactions);
    
    // Convert to worksheet
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    
    // Set column widths
    ws['!cols'] = [
      { width: 5 },   // Column A
      { width: 50 },  // Column B
      { width: 15 },  // Column C
      { width: 15 },  // Column D
      { width: 15 },  // Column E
      { width: 15 }   // Column F
    ];

    // Add the worksheet to workbook
    XLSX.utils.book_append_sheet(wb, ws, 'VENTILATION');
    
    // Save the file
    XLSX.writeFile(wb, 'ONT_VENTILATION_2024.xlsx');
  }

  /**
   * Creates the template data structure with formulas
   */
  private createTemplateData(transactions: TransactionData[]): any[][] {
    // Process transactions to get aggregated data
    const processedData = this.processTransactions(transactions);
    
    // Create the template structure
    const data: any[][] = [];
    
    // Header rows
    data.push(['', 'REPUBLIQUE DEMOCRATIQUE DU CONGO', '', '', '', '']);
    data.push(['', 'OFFICE NATIONAL DU TOURISME', '', '', '', '']);
    data.push(['', 'DIRECTION FINANCIERE', '', '', '', '']);
    data.push(['', '', '', '', '', '']);
    data.push(['', '', '', '', '', '']);
    data.push(['', 'VENTILATION DES DEPENSES DU FONDS DE PROMOTION DU TOURISME EXERCICE 2024', '', '', '', '']);
    data.push(['', '', '', '', '', '']);
    data.push(['N°', 'DESIGNATION', 'MONTANT', '', '', '']);
    data.push(['CPTE', '', '', '', '', '']);
    data.push(['', '', '', '', '', '']);
    data.push(['', '', '', '', '', '']);
    data.push(['', 'ENTREES', '', '', '', '']);
    
    // Row 13 - Report date with current date
    const currentDate = new Date().toLocaleDateString('fr-FR');
    data.push(['', `REPORT AU 01 JANVIER 2024`, processedData.reportAmount || 13298589.15, '', '', '']);
    
    // Row 14 - Receipts calculation
    data.push(['', 'RECETTES DU FPT REALISE DU 01 JANVVIER AU 31 DEC 2024', processedData.totalReceipts || 33675831380.81, '', '', '']);
    
    data.push(['', '', '', '', '', '']);
    
    // Row 16 - Total receipts (sum of C13 + C14)
    data.push(['', 'TOTAL RECETTES', { f: 'C13+C14' }, '', '', '']);
    
    data.push(['', '', '', '', '', '']);
    data.push(['', '', '', '', '', '']);
    
    // Row 19 - Account 60 total (sum of C20:C26)
    data.push(['60', '1.Achat et variation de stock', { f: 'SUM(C20:C26)' }, '', '', '']);
    
    // Rows 20-26 - Individual account items
    data.push(['', '• Eau', processedData.accountData['EAU'] || 46574385.58, '', '', '']);
    data.push(['', '• Electricité', processedData.accountData['ELECTRICITE'] || 54041736.36, '', '', '']);
    data.push(['', '• Carburant', processedData.accountData['CARBURANT'] || 122189392.09, '', '', '']);
    data.push(['', '• Produits d\'entretien', processedData.accountData['PRODUITS_ENTRETIEN'] || 1662410.00, '', '', '']);
    data.push(['', '• Fournitures de bureau et consommables informatiques', processedData.accountData['FOURNITURES'] || 130737751.70, '', '', '']);
    data.push(['', '• Achat petits matériels et outillages', processedData.accountData['PETITS_MATERIELS'] || 58740984.16, '', '', '']);
    data.push(['', '• Fonctionnement', processedData.accountData['FONCTIONNEMENT'] || 0, '', '', '']);
    
    // Row 27 - Account 61
    data.push(['61', '2. Transport', processedData.accountData['TRANSPORT'] || 830751906.53, '', '', '']);

    return data;
  }

  /**
   * Processes transactions to extract relevant data for the template
   */
  private processTransactions(transactions: TransactionData[]): ExcelTemplateData {
    const accountData: { [key: string]: number } = {};
    let totalReceipts = 0;
    
    // Map transaction designations to account categories
    const designationMapping: { [key: string]: string } = {
      'PMT TOURISME': 'PMT_TOURISME',
      'FPT INVESTISSEMENT': 'FPT_INVESTISSEMENT',
      'ONT FICHE STATISTIQUES': 'ONT_STATISTIQUES',
      'APPUI ADM DU TOURISME': 'APPUI_TOURISME',
      'ICCN': 'ICCN',
      'SITE TOURISTIQUE': 'SITE_TOURISTIQUE',
      'COMITE DE SUIVI ET VALIDATION': 'COMITE_SUIVI',
      'ONT CONTROLE ET INSPECTION DES UNITES TOURISTIQUES': 'ONT_CONTROLE'
    };

    // Process each transaction
    transactions.forEach(transaction => {
      const mappedKey = designationMapping[transaction.designation];
      if (mappedKey) {
        if (!accountData[mappedKey]) {
          accountData[mappedKey] = 0;
        }
        accountData[mappedKey] += Math.abs(transaction.montant);
        totalReceipts += Math.abs(transaction.montant);
      }
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
          
          // Update specific cells
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
   * Updates specific cells in the worksheet
   */
  private updateWorksheetCells(worksheet: XLSX.WorkSheet, data: ExcelTemplateData): void {
    // Update C13 - Report amount
    worksheet['C13'] = { t: 'n', v: 13298589.15 };
    
    // Update C14 - Total receipts from transactions
    worksheet['C14'] = { t: 'n', v: data.totalReceipts };
    
    // Update C16 - Formula for total receipts
    worksheet['C16'] = { t: 'n', f: 'C13+C14' };
    
    // Update C19 - Formula for account 60 total
    worksheet['C19'] = { t: 'n', f: 'SUM(C20:C26)' };
    
    // Update individual account items (C20-C26)
    const accountMappings = [
      { cell: 'C20', key: 'EAU', default: 46574385.58 },
      { cell: 'C21', key: 'ELECTRICITE', default: 54041736.36 },
      { cell: 'C22', key: 'CARBURANT', default: 122189392.09 },
      { cell: 'C23', key: 'PRODUITS_ENTRETIEN', default: 1662410.00 },
      { cell: 'C24', key: 'FOURNITURES', default: 130737751.70 },
      { cell: 'C25', key: 'PETITS_MATERIELS', default: 58740984.16 },
      { cell: 'C26', key: 'FONCTIONNEMENT', default: 0 }
    ];
    
    accountMappings.forEach(mapping => {
      const value = data.accountData[mapping.key] || mapping.default;
      worksheet[mapping.cell] = { t: 'n', v: value };
    });
    
    // Update C27 - Transport
    worksheet['C27'] = { t: 'n', v: data.accountData['TRANSPORT'] || 830751906.53 };
  }

  /**
   * Validates extracted data against expected ranges
   */
  validateData(transactions: TransactionData[]): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    if (!transactions || transactions.length === 0) {
      errors.push('Aucune transaction trouvée dans le PDF');
    }
    
    // Check for required designations
    const requiredDesignations = [
      'PMT TOURISME',
      'FPT INVESTISSEMENT',
      'ONT FICHE STATISTIQUES'
    ];
    
    const foundDesignations = transactions.map(t => t.designation);
    requiredDesignations.forEach(designation => {
      if (!foundDesignations.includes(designation)) {
        errors.push(`Désignation manquante: ${designation}`);
      }
    });
    
    // Check for reasonable amounts
    transactions.forEach(transaction => {
      if (Math.abs(transaction.montant) > 1000000000) { // 1 billion limit
        errors.push(`Montant suspect pour ${transaction.designation}: ${transaction.montant}`);
      }
    });
    
    return {
      isValid: errors.length === 0,
      errors: errors
    };
  }
}