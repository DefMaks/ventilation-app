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
   * Creates complete template data structure matching the PDF
   */
  private createTemplateFromPDF(transactions: TransactionData[]): any[][] {
    // Process transactions to get aggregated data
    const processedData = this.processTransactions(transactions);
    
    const data: any[][] = [];
    
    // Header section
    data.push(['REPUBLIQUE DEMOCRATIQUE DU CONGO', '', '', '', '', '']);
    data.push(['OFFICE NATIONAL DU TOURISME', '', '', '', '', '']);
    data.push(['DIRECTION FINANCIERE', '', '', '', '', '']);
    data.push(['', '', '', '', '', '']);
    data.push(['', '', '', '', '', '']);
    data.push(['VENTILATION DES DEPENSES DU FONDS DE PROMOTION DU TOURISME EXERCICE 2024', '', '', '', '', '']);
    data.push(['', '', '', '', '', '']);
    data.push(['N°', 'DESIGNATION', 'MONTANT', '', '', '']);
    data.push(['CPTE', '', '', '', '', '']);
    data.push(['', '', '', '', '', '']);
    data.push(['', '', '', '', '', '']);
    
    // ENTREES section
    data.push(['', 'ENTREES', '', '', '', '']);
    data.push(['', 'REPORT AU 01 JANVIER 2024', 13298589.15, '', '', '']);
    data.push(['', 'RECETTES DU FPT REALISE DU 01 JANVIER AU 31 DEC 2024', processedData.totalReceipts, '', '', '']);
    data.push(['', '', '', '', '', '']);
    data.push(['', 'TOTAL RECETTES', { f: 'C13+C14' }, '', '', '']);
    data.push(['', '', '', '', '', '']);
    data.push(['', '', '', '', '', '']);
    
    // Account 60 - Achats et variation de stock
    data.push(['60', '1.Achat et variation de stock', { f: 'SUM(C20:C26)' }, '', '', '']);
    data.push(['', '• Eau', this.getExtractedValue(processedData, 'EAU'), '', '', '']);
    data.push(['', '• Electricité', this.getExtractedValue(processedData, 'ELECTRICITE'), '', '', '']);
    data.push(['', '• Carburant', this.getExtractedValue(processedData, 'CARBURANT'), '', '', '']);
    data.push(['', '• Produits d\'entretien', this.getExtractedValue(processedData, 'PRODUITS_ENTRETIEN'), '', '', '']);
    data.push(['', '• Fournitures de bureau et consommables informatiques', this.getExtractedValue(processedData, 'FOURNITURES'), '', '', '']);
    data.push(['', '• Achat petits matériels et outillages', this.getExtractedValue(processedData, 'PETITS_MATERIELS'), '', '', '']);
    data.push(['', '• Fonctionnement', this.getExtractedValue(processedData, 'FONCTIONNEMENT'), '', '', '']);
    
    // Account 61 - Transport
    data.push(['61', '2. Transport', this.getExtractedValue(processedData, 'TRANSPORT'), '', '', '']);
    
    // Account 62 - Services extérieurs
    data.push(['62', '3. Services extérieurs', { f: 'SUM(C29:C35)' }, '', '', '']);
    data.push(['', '• Entretien et réparations', this.getExtractedValue(processedData, 'ENTRETIEN_REPARATIONS'), '', '', '']);
    data.push(['', '• Assurances', this.getExtractedValue(processedData, 'ASSURANCES'), '', '', '']);
    data.push(['', '• Etudes et recherches', this.getExtractedValue(processedData, 'ETUDES_RECHERCHES'), '', '', '']);
    data.push(['', '• Documentation', this.getExtractedValue(processedData, 'DOCUMENTATION'), '', '', '']);
    data.push(['', '• Colloques, séminaires, conférences', this.getExtractedValue(processedData, 'COLLOQUES'), '', '', '']);
    data.push(['', '• Réceptions', this.getExtractedValue(processedData, 'RECEPTIONS'), '', '', '']);
    data.push(['', '• Publicité, publications, relations publiques', this.getExtractedValue(processedData, 'PUBLICITE'), '', '', '']);
    
    // Account 63 - Autres services extérieurs
    data.push(['63', '4. Autres services extérieurs', { f: 'SUM(C37:C42)' }, '', '', '']);
    data.push(['', '• Rémunérations d\'intermédiaires et honoraires', this.getExtractedValue(processedData, 'REMUNERATIONS'), '', '', '']);
    data.push(['', '• Frais d\'actes et de contentieux', this.getExtractedValue(processedData, 'FRAIS_ACTES'), '', '', '']);
    data.push(['', '• Frais de télécommunications', this.getExtractedValue(processedData, 'TELECOMMUNICATIONS'), '', '', '']);
    data.push(['', '• Services bancaires et assimilés', this.getExtractedValue(processedData, 'SERVICES_BANCAIRES'), '', '', '']);
    data.push(['', '• Frais de formation du personnel', this.getExtractedValue(processedData, 'FORMATION'), '', '', '']);
    data.push(['', '• Autres services extérieurs', this.getExtractedValue(processedData, 'AUTRES_SERVICES'), '', '', '']);
    
    // Account 64 - Impôts et taxes
    data.push(['64', '5. Impôts et taxes', this.getExtractedValue(processedData, 'IMPOTS_TAXES'), '', '', '']);
    
    // Account 65 - Autres charges
    data.push(['65', '6. Autres charges', { f: 'SUM(C45:C47)' }, '', '', '']);
    data.push(['', '• Pertes sur créances irrécouvrables', this.getExtractedValue(processedData, 'PERTES_CREANCES'), '', '', '']);
    data.push(['', '• Charges exceptionnelles', this.getExtractedValue(processedData, 'CHARGES_EXCEPTIONNELLES'), '', '', '']);
    data.push(['', '• Autres charges diverses', this.getExtractedValue(processedData, 'AUTRES_CHARGES'), '', '', '']);
    
    // Account 66 - Charges de personnel
    data.push(['66', '7. Charges de personnel', { f: 'SUM(C49:C54)' }, '', '', '']);
    data.push(['', '• Appointements et salaires', this.getExtractedValue(processedData, 'SALAIRES'), '', '', '']);
    data.push(['', '• Primes et gratifications', this.getExtractedValue(processedData, 'PRIMES'), '', '', '']);
    data.push(['', '• Indemnités', this.getExtractedValue(processedData, 'INDEMNITES'), '', '', '']);
    data.push(['', '• Charges sociales', this.getExtractedValue(processedData, 'CHARGES_SOCIALES'), '', '', '']);
    data.push(['', '• Charges de retraite', this.getExtractedValue(processedData, 'CHARGES_RETRAITE'), '', '', '']);
    data.push(['', '• Autres charges de personnel', this.getExtractedValue(processedData, 'AUTRES_CHARGES_PERSONNEL'), '', '', '']);
    
    // Account 67 - Frais financiers
    data.push(['67', '8. Frais financiers', { f: 'SUM(C56:C58)' }, '', '', '']);
    data.push(['', '• Intérêts des emprunts', this.getExtractedValue(processedData, 'INTERETS_EMPRUNTS'), '', '', '']);
    data.push(['', '• Escomptes accordés', this.getExtractedValue(processedData, 'ESCOMPTES'), '', '', '']);
    data.push(['', '• Autres frais financiers', this.getExtractedValue(processedData, 'AUTRES_FRAIS_FINANCIERS'), '', '', '']);
    
    // Account 68 - Dotations aux amortissements
    data.push(['68', '9. Dotations aux amortissements', { f: 'SUM(C60:C62)' }, '', '', '']);
    data.push(['', '• Dotations aux amortissements des immobilisations incorporelles', this.getExtractedValue(processedData, 'AMORT_INCORPORELLES'), '', '', '']);
    data.push(['', '• Dotations aux amortissements des immobilisations corporelles', this.getExtractedValue(processedData, 'AMORT_CORPORELLES'), '', '', '']);
    data.push(['', '• Dotations aux amortissements des charges immobilisées', this.getExtractedValue(processedData, 'AMORT_CHARGES'), '', '', '']);
    
    // Account 69 - Dotations aux provisions
    data.push(['69', '10. Dotations aux provisions', { f: 'SUM(C64:C66)' }, '', '', '']);
    data.push(['', '• Dotations aux provisions pour risques et charges', this.getExtractedValue(processedData, 'PROVISIONS_RISQUES'), '', '', '']);
    data.push(['', '• Dotations aux provisions pour dépréciation', this.getExtractedValue(processedData, 'PROVISIONS_DEPRECIATION'), '', '', '']);
    data.push(['', '• Dotations aux provisions réglementées', this.getExtractedValue(processedData, 'PROVISIONS_REGLEMENTEES'), '', '', '']);
    
    // TOTAL DEPENSES
    data.push(['', '', '', '', '', '']);
    data.push(['', 'TOTAL DEPENSES', { f: 'SUM(C19,C27,C28,C36,C43,C44,C48,C55,C59,C63)' }, '', '', '']);
    
    // SOLDE
    data.push(['', '', '', '', '', '']);
    data.push(['', 'SOLDE AU 31 DECEMBRE 2024', { f: 'C16-C68' }, '', '', '']);
    
    // Signature section
    data.push(['', '', '', '', '', '']);
    data.push(['', '', '', '', '', '']);
    data.push(['Fait à Kinshasa, le _______________', '', '', 'Le Directeur Financier', '', '']);
    data.push(['', '', '', '', '', '']);
    data.push(['', '', '', '', '', '']);
    data.push(['Le Directeur Général', '', '', '________________________', '', '']);

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
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:F80');
    
    for (let R = range.s.r; R <= range.e.r; ++R) {
      for (let C = range.s.c; C <= range.e.c; ++C) {
        const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
        if (!ws[cellAddress]) continue;
        
        // Format column C (amounts) as numbers with 2 decimal places
        if (C === 2 && typeof ws[cellAddress].v === 'number') {
          ws[cellAddress].z = '#,##0.00';
        }
        
        // Bold headers and account numbers
        if (R === 0 || R === 1 || R === 2 || R === 5 || R === 7 || 
            (C === 0 && typeof ws[cellAddress].v === 'string' && /^\d+$/.test(ws[cellAddress].v))) {
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
   * Enhanced transaction processing with comprehensive mapping
   */
  private processTransactions(transactions: TransactionData[]): ExcelTemplateData {
    const accountData: { [key: string]: number } = {};
    let totalReceipts = 0;
    
    // Comprehensive mapping for all account categories
    const designationMapping: { [key: string]: string } = {
      // Direct mappings from PDF designations
      'PMT TOURISME': 'PMT_TOURISME',
      'FPT INVESTISSEMENT': 'FPT_INVESTISSEMENT', 
      'ONT FICHE STATISTIQUES': 'ONT_STATISTIQUES',
      'APPUI ADM DU TOURISME': 'APPUI_TOURISME',
      'ICCN': 'ICCN',
      'SITE TOURISTIQUE': 'SITE_TOURISTIQUE',
      'COMITE DE SUIVI ET VALIDATION': 'COMITE_SUIVI',
      'ONT CONTROLE ET INSPECTION DES UNITES TOURISTIQUES': 'ONT_CONTROLE',
      
      // Account 60 - Achats et variation de stock
      'EAU': 'EAU',
      'ELECTRICITE': 'ELECTRICITE', 
      'CARBURANT': 'CARBURANT',
      'ENTRETIEN': 'PRODUITS_ENTRETIEN',
      'FOURNITURE': 'FOURNITURES',
      'MATERIEL': 'PETITS_MATERIELS',
      'FONCTIONNEMENT': 'FONCTIONNEMENT',
      
      // Account 61 - Transport
      'TRANSPORT': 'TRANSPORT',
      'DEPLACEMENT': 'TRANSPORT',
      'MISSION': 'TRANSPORT',
      
      // Account 62 - Services extérieurs
      'REPARATION': 'ENTRETIEN_REPARATIONS',
      'ASSURANCE': 'ASSURANCES',
      'ETUDE': 'ETUDES_RECHERCHES',
      'RECHERCHE': 'ETUDES_RECHERCHES',
      'DOCUMENTATION': 'DOCUMENTATION',
      'SEMINAIRE': 'COLLOQUES',
      'CONFERENCE': 'COLLOQUES',
      'COLLOQUE': 'COLLOQUES',
      'RECEPTION': 'RECEPTIONS',
      'PUBLICITE': 'PUBLICITE',
      'PUBLICATION': 'PUBLICITE',
      
      // Account 63 - Autres services extérieurs
      'HONORAIRE': 'REMUNERATIONS',
      'REMUNERATION': 'REMUNERATIONS',
      'CONTENTIEUX': 'FRAIS_ACTES',
      'TELECOMMUNICATION': 'TELECOMMUNICATIONS',
      'TELEPHONE': 'TELECOMMUNICATIONS',
      'INTERNET': 'TELECOMMUNICATIONS',
      'BANCAIRE': 'SERVICES_BANCAIRES',
      'FORMATION': 'FORMATION',
      
      // Account 64 - Impôts et taxes
      'IMPOT': 'IMPOTS_TAXES',
      'TAXE': 'IMPOTS_TAXES',
      
      // Account 65 - Autres charges
      'CREANCE': 'PERTES_CREANCES',
      'EXCEPTIONNEL': 'CHARGES_EXCEPTIONNELLES',
      
      // Account 66 - Charges de personnel
      'SALAIRE': 'SALAIRES',
      'APPOINTEMENT': 'SALAIRES',
      'PRIME': 'PRIMES',
      'GRATIFICATION': 'PRIMES',
      'INDEMNITE': 'INDEMNITES',
      'SOCIAL': 'CHARGES_SOCIALES',
      'RETRAITE': 'CHARGES_RETRAITE',
      'PERSONNEL': 'AUTRES_CHARGES_PERSONNEL',
      
      // Account 67 - Frais financiers
      'INTERET': 'INTERETS_EMPRUNTS',
      'EMPRUNT': 'INTERETS_EMPRUNTS',
      'ESCOMPTE': 'ESCOMPTES',
      'FINANCIER': 'AUTRES_FRAIS_FINANCIERS',
      
      // Account 68 - Dotations aux amortissements
      'AMORTISSEMENT': 'AMORT_CORPORELLES',
      'INCORPOREL': 'AMORT_INCORPORELLES',
      'CORPOREL': 'AMORT_CORPORELLES',
      
      // Account 69 - Dotations aux provisions
      'PROVISION': 'PROVISIONS_RISQUES',
      'RISQUE': 'PROVISIONS_RISQUES',
      'DEPRECIATION': 'PROVISIONS_DEPRECIATION'
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
      
      // If still no match, try to categorize based on common patterns
      if (!mappedKey) {
        const designation = transaction.designation.toUpperCase();
        if (designation.includes('ACHAT') || designation.includes('FOURNITURE')) {
          mappedKey = 'FOURNITURES';
        } else if (designation.includes('SERVICE')) {
          mappedKey = 'AUTRES_SERVICES';
        } else if (designation.includes('CHARGE')) {
          mappedKey = 'AUTRES_CHARGES';
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
    // Update main totals
    worksheet['C14'] = { t: 'n', v: data.totalReceipts };
    worksheet['C16'] = { t: 'n', f: 'C13+C14' };
    
    // Update account formulas and individual items
    const cellMappings = [
      // Account 60 items
      { cell: 'C19', formula: 'SUM(C20:C26)' },
      { cell: 'C20', key: 'EAU' },
      { cell: 'C21', key: 'ELECTRICITE' },
      { cell: 'C22', key: 'CARBURANT' },
      { cell: 'C23', key: 'PRODUITS_ENTRETIEN' },
      { cell: 'C24', key: 'FOURNITURES' },
      { cell: 'C25', key: 'PETITS_MATERIELS' },
      { cell: 'C26', key: 'FONCTIONNEMENT' },
      
      // Account 61
      { cell: 'C27', key: 'TRANSPORT' },
      
      // Account 62 items
      { cell: 'C28', formula: 'SUM(C29:C35)' },
      { cell: 'C29', key: 'ENTRETIEN_REPARATIONS' },
      { cell: 'C30', key: 'ASSURANCES' },
      { cell: 'C31', key: 'ETUDES_RECHERCHES' },
      { cell: 'C32', key: 'DOCUMENTATION' },
      { cell: 'C33', key: 'COLLOQUES' },
      { cell: 'C34', key: 'RECEPTIONS' },
      { cell: 'C35', key: 'PUBLICITE' },
      
      // Account 63 items
      { cell: 'C36', formula: 'SUM(C37:C42)' },
      { cell: 'C37', key: 'REMUNERATIONS' },
      { cell: 'C38', key: 'FRAIS_ACTES' },
      { cell: 'C39', key: 'TELECOMMUNICATIONS' },
      { cell: 'C40', key: 'SERVICES_BANCAIRES' },
      { cell: 'C41', key: 'FORMATION' },
      { cell: 'C42', key: 'AUTRES_SERVICES' },
      
      // Account 64
      { cell: 'C43', key: 'IMPOTS_TAXES' },
      
      // Account 65 items
      { cell: 'C44', formula: 'SUM(C45:C47)' },
      { cell: 'C45', key: 'PERTES_CREANCES' },
      { cell: 'C46', key: 'CHARGES_EXCEPTIONNELLES' },
      { cell: 'C47', key: 'AUTRES_CHARGES' },
      
      // Account 66 items
      { cell: 'C48', formula: 'SUM(C49:C54)' },
      { cell: 'C49', key: 'SALAIRES' },
      { cell: 'C50', key: 'PRIMES' },
      { cell: 'C51', key: 'INDEMNITES' },
      { cell: 'C52', key: 'CHARGES_SOCIALES' },
      { cell: 'C53', key: 'CHARGES_RETRAITE' },
      { cell: 'C54', key: 'AUTRES_CHARGES_PERSONNEL' },
      
      // Account 67 items
      { cell: 'C55', formula: 'SUM(C56:C58)' },
      { cell: 'C56', key: 'INTERETS_EMPRUNTS' },
      { cell: 'C57', key: 'ESCOMPTES' },
      { cell: 'C58', key: 'AUTRES_FRAIS_FINANCIERS' },
      
      // Account 68 items
      { cell: 'C59', formula: 'SUM(C60:C62)' },
      { cell: 'C60', key: 'AMORT_INCORPORELLES' },
      { cell: 'C61', key: 'AMORT_CORPORELLES' },
      { cell: 'C62', key: 'AMORT_CHARGES' },
      
      // Account 69 items
      { cell: 'C63', formula: 'SUM(C64:C66)' },
      { cell: 'C64', key: 'PROVISIONS_RISQUES' },
      { cell: 'C65', key: 'PROVISIONS_DEPRECIATION' },
      { cell: 'C66', key: 'PROVISIONS_REGLEMENTEES' }
    ];
    
    cellMappings.forEach(mapping => {
      if (mapping.formula) {
        worksheet[mapping.cell] = { t: 'n', f: mapping.formula };
      } else if (mapping.key) {
        const value = data.accountData[mapping.key] || 0;
        worksheet[mapping.cell] = { t: 'n', v: value };
      }
    });
    
    // Update total expenses formula
    worksheet['C68'] = { t: 'n', f: 'SUM(C19,C27,C28,C36,C43,C44,C48,C55,C59,C63)' };
    
    // Update final balance
    worksheet['C70'] = { t: 'n', f: 'C16-C68' };
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