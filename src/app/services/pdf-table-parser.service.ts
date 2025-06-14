import { Injectable } from '@angular/core';
import * as pdfjsLib from 'pdfjs-dist';

export interface TableCell {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TableRow {
  y: number;
  cells: TableCell[];
  cellCount: number;
  rawText: string;
}

export interface TableStructure {
  headers: string[];
  rows: TableRow[];
  columnPositions: number[];
  rawText: string;
  allTextItems: any[];
  debitColumnIndex?: number;
  creditColumnIndex?: number;
}

@Injectable({
  providedIn: 'root'
})
export class PdfTableParserService {

  constructor() { }

  /**
   * Analyze table structure from PDF page - Enhanced with column detection
   */
  async analyzeTableStructure(page: any): Promise<TableStructure> {
    const content = await page.getTextContent();
    const textItems = content.items;

    const rawText = textItems.map((item: any) => item.str).join(' ');
    console.log('=== PDF ANALYSIS START ===');
    console.log('Total text items found:', textItems.length);

    // Group text items by Y position (rows)
    const rowGroups = this.groupItemsByRowEnhanced(textItems);
    console.log('Row groups found:', rowGroups.size);
    
    // Analyze column positions
    const columnPositions = this.detectColumnPositionsEnhanced(textItems);
    console.log('Column positions detected:', columnPositions);
    
    // Build table structure
    const rows: TableRow[] = [];
    let headers: string[] = [];

    let rowIndex = 0;
    for (const [y, items] of rowGroups) {
      const cells = this.assignItemsToCellsEnhanced(items, columnPositions);
      const rowText = cells.map(c => c.text).join(' ');
      
      const row: TableRow = {
        y: y,
        cells: cells,
        cellCount: cells.length,
        rawText: rowText
      };
      
      console.log(`Row ${rowIndex} (y=${y}): [${cells.map(c => `"${c.text}"`).join(', ')}]`);
      rows.push(row);
      
      // Try to detect headers
      if (rows.length <= 5 && this.looksLikeHeaderEnhanced(cells)) {
        headers = cells.map(cell => cell.text);
        console.log('Detected headers:', headers);
      }
      
      rowIndex++;
    }

    // **NEW: Detect debit and credit column positions**
    const { debitColumnIndex, creditColumnIndex } = this.detectDebitCreditColumns(headers, rows);
    
    console.log('=== COLUMN DETECTION ===');
    console.log('Debit column index:', debitColumnIndex);
    console.log('Credit column index:', creditColumnIndex);
    console.log('=== PDF ANALYSIS END ===');

    return {
      headers,
      rows,
      columnPositions,
      rawText,
      allTextItems: textItems,
      debitColumnIndex,
      creditColumnIndex
    };
  }

  /**
   * **NEW: Detect which columns contain debit and credit amounts**
   */
  private detectDebitCreditColumns(headers: string[], rows: TableRow[]): { debitColumnIndex?: number, creditColumnIndex?: number } {
    let debitColumnIndex: number | undefined;
    let creditColumnIndex: number | undefined;

    // Method 1: Look for header keywords
    headers.forEach((header, index) => {
      const headerLower = header.toLowerCase();
      
      if (headerLower.includes('debit') || headerLower.includes('débit') || 
          headerLower.includes('sortie') || headerLower.includes('retrait')) {
        debitColumnIndex = index;
        console.log(`Found DEBIT column by header: "${header}" at index ${index}`);
      }
      
      if (headerLower.includes('credit') || headerLower.includes('crédit') || 
          headerLower.includes('entree') || headerLower.includes('entrée') || 
          headerLower.includes('depot') || headerLower.includes('dépôt')) {
        creditColumnIndex = index;
        console.log(`Found CREDIT column by header: "${header}" at index ${index}`);
      }
    });

    // Method 2: Analyze column content patterns if headers don't work
    if (debitColumnIndex === undefined || creditColumnIndex === undefined) {
      console.log('Headers unclear, analyzing column patterns...');
      
      const columnAnalysis = this.analyzeColumnPatterns(rows);
      
      if (debitColumnIndex === undefined) {
        debitColumnIndex = columnAnalysis.mostLikelyDebitColumn;
      }
      if (creditColumnIndex === undefined) {
        creditColumnIndex = columnAnalysis.mostLikelyCreditColumn;
      }
    }

    // Method 3: Smart fallback based on typical bank statement structure
    if (debitColumnIndex === undefined && creditColumnIndex === undefined) {
      console.log('Using fallback column detection...');
      
      // In typical bank statements:
      // - Date is usually first column
      // - Description/Narrative is usually second column  
      // - Debit is often third column
      // - Credit is often fourth column
      // - Balance is often last column
      
      const numColumns = Math.max(...rows.map(r => r.cells.length));
      
      if (numColumns >= 4) {
        debitColumnIndex = 2; // Third column (0-indexed)
        creditColumnIndex = 3; // Fourth column (0-indexed)
        console.log(`Fallback: assuming debit=column ${debitColumnIndex}, credit=column ${creditColumnIndex}`);
      } else if (numColumns >= 3) {
        // If only 3 columns, assume: Date, Description, Amount
        // We'll need to determine if amount is debit or credit based on context
        debitColumnIndex = 2;
        console.log(`Fallback: assuming single amount column ${debitColumnIndex} (will determine debit/credit by context)`);
      }
    }

    return { debitColumnIndex, creditColumnIndex };
  }

  /**
   * **NEW: Analyze column patterns to identify debit/credit columns**
   */
  private analyzeColumnPatterns(rows: TableRow[]): { mostLikelyDebitColumn?: number, mostLikelyCreditColumn?: number } {
    const columnStats = new Map<number, { amountCount: number, totalAmount: number, hasNegatives: boolean }>();
    
    // Analyze each column for amount patterns
    rows.forEach(row => {
      row.cells.forEach((cell, columnIndex) => {
        if (this.isValidAmountFormat(cell.text)) {
          const amount = this.parseAmountEnhanced(cell.text);
          
          if (amount > 0) {
            if (!columnStats.has(columnIndex)) {
              columnStats.set(columnIndex, { amountCount: 0, totalAmount: 0, hasNegatives: false });
            }
            
            const stats = columnStats.get(columnIndex)!;
            stats.amountCount++;
            stats.totalAmount += amount;
            
            // Check if this looks like a negative amount (parentheses, minus sign)
            if (cell.text.includes('(') || cell.text.includes('-')) {
              stats.hasNegatives = true;
            }
          }
        }
      });
    });

    console.log('Column analysis:', Array.from(columnStats.entries()));

    // Find columns with significant amount activity
    const amountColumns = Array.from(columnStats.entries())
      .filter(([_, stats]) => stats.amountCount >= 2) // At least 2 amounts
      .sort((a, b) => b[1].amountCount - a[1].amountCount); // Sort by frequency

    let mostLikelyDebitColumn: number | undefined;
    let mostLikelyCreditColumn: number | undefined;

    if (amountColumns.length >= 2) {
      // If we have 2+ amount columns, assume first is debit, second is credit
      mostLikelyDebitColumn = amountColumns[0][0];
      mostLikelyCreditColumn = amountColumns[1][0];
      console.log(`Pattern analysis: debit=column ${mostLikelyDebitColumn}, credit=column ${mostLikelyCreditColumn}`);
    } else if (amountColumns.length === 1) {
      // Single amount column - we'll determine debit/credit by transaction context
      mostLikelyDebitColumn = amountColumns[0][0];
      console.log(`Pattern analysis: single amount column ${mostLikelyDebitColumn}`);
    }

    return { mostLikelyDebitColumn, mostLikelyCreditColumn };
  }

  /**
   * Enhanced transaction extraction with proper debit/credit detection
   */
  extractTransactionsFromTable(tableStructure: TableStructure): any[] {
    console.log('=== TRANSACTION EXTRACTION START ===');
    
    let transactions: any[] = [];
    
    // Strategy 1: Use detected column structure
    if (tableStructure.debitColumnIndex !== undefined || tableStructure.creditColumnIndex !== undefined) {
      transactions = this.extractWithColumnStructure(tableStructure);
      console.log('Strategy 1 (Column Structure) found:', transactions.length, 'transactions');
    }
    
    // Strategy 2: Pattern matching fallback
    if (transactions.length === 0) {
      transactions = this.extractWithRowPatternMatching(tableStructure);
      console.log('Strategy 2 (Row Pattern) found:', transactions.length, 'transactions');
    }
    
    // Strategy 3: Flexible text search
    if (transactions.length === 0) {
      transactions = this.extractWithFlexibleSearch(tableStructure);
      console.log('Strategy 3 (Flexible Search) found:', transactions.length, 'transactions');
    }
    
    // Validate and clean transactions
    transactions = this.validateAndCleanTransactions(transactions);
    
    console.log('=== TRANSACTION EXTRACTION END ===');
    console.log('Final valid transactions found:', transactions);
    
    return transactions;
  }

  /**
   * **NEW: Extract transactions using detected column structure**
   */
  private extractWithColumnStructure(tableStructure: TableStructure): any[] {
    const transactions: any[] = [];
    const datePattern = /\d{1,2}[-\/]\d{1,2}[-\/]\d{4}/;
    
    console.log('=== COLUMN STRUCTURE EXTRACTION ===');
    console.log('Using debit column:', tableStructure.debitColumnIndex);
    console.log('Using credit column:', tableStructure.creditColumnIndex);
    
    tableStructure.rows.forEach((row, index) => {
      // Find date cell
      const dateCell = row.cells.find(cell => datePattern.test(cell.text));
      if (!dateCell) return;
      
      // Find narrative/designation cell
      const narrativeCell = row.cells
        .filter(cell => 
          cell.text.length > 5 && 
          !datePattern.test(cell.text) && 
          !this.isAmountOnly(cell.text)
        )
        .sort((a, b) => b.text.length - a.text.length)[0];
      
      if (!narrativeCell) return;
      
      // Check if it's a target designation
      if (this.isTargetDesignation(narrativeCell.text)) {
        let debit = 0;
        let credit = 0;
        
        // Extract debit amount
        if (tableStructure.debitColumnIndex !== undefined && 
            row.cells[tableStructure.debitColumnIndex]) {
          const debitText = row.cells[tableStructure.debitColumnIndex].text;
          if (this.isValidAmountFormat(debitText)) {
            debit = this.parseAmountEnhanced(debitText);
          }
        }
        
        // Extract credit amount
        if (tableStructure.creditColumnIndex !== undefined && 
            row.cells[tableStructure.creditColumnIndex]) {
          const creditText = row.cells[tableStructure.creditColumnIndex].text;
          if (this.isValidAmountFormat(creditText)) {
            credit = this.parseAmountEnhanced(creditText);
          }
        }
        
        // If we only have one amount column, determine debit/credit by context
        if (tableStructure.creditColumnIndex === undefined && debit > 0) {
          // Single amount column - determine if it's debit or credit based on designation
          if (this.isLikelyCredit(narrativeCell.text)) {
            credit = debit;
            debit = 0;
          }
          // Otherwise keep as debit (default for expenses)
        }
        
        // Calculate net amount
        const montant = credit - debit;
        
        // Only add if we have a valid amount
        if (debit > 0 || credit > 0) {
          // Validate amounts are reasonable
          if ((debit === 0 || debit <= 10000000) && (credit === 0 || credit <= 10000000)) {
            transactions.push({
              date: dateCell.text,
              designation: narrativeCell.text,
              debit: debit,
              credit: credit,
              montant: montant
            });
            
            console.log('✓ Column extraction found:', {
              date: dateCell.text,
              designation: narrativeCell.text,
              debit: debit,
              credit: credit,
              montant: montant
            });
          } else {
            console.warn('Rejected unrealistic amounts:', { debit, credit });
          }
        }
      }
    });
    
    return transactions;
  }

  /**
   * **NEW: Determine if a designation is likely a credit transaction**
   */
  private isLikelyCredit(designation: string): boolean {
    const creditKeywords = [
      'depot', 'dépôt', 'versement', 'virement reçu', 'recette', 'encaissement',
      'credit', 'crédit', 'remboursement', 'interet', 'intérêt', 'dividende',
      'salaire', 'pension', 'allocation', 'subvention', 'don', 'recettes'
    ];
    
    const designationLower = designation.toLowerCase();
    return creditKeywords.some(keyword => designationLower.includes(keyword));
  }

  /**
   * Enhanced row grouping with multiple tolerance levels
   */
  private groupItemsByRowEnhanced(textItems: any[]): Map<number, any[]> {
    const rowGroups = new Map<number, any[]>();
    
    const tolerances = [2, 5, 8, 12];
    let bestTolerance = tolerances[0];
    let bestGroupCount = 0;

    for (const tolerance of tolerances) {
      const testGroups = new Map<number, any[]>();
      
      textItems.forEach(item => {
        const y = Math.round(item.transform[5] / tolerance) * tolerance;
        
        if (!testGroups.has(y)) {
          testGroups.set(y, []);
        }
        testGroups.get(y)!.push(item);
      });

      if (testGroups.size > bestGroupCount && testGroups.size < textItems.length / 2) {
        bestGroupCount = testGroups.size;
        bestTolerance = tolerance;
      }
    }

    console.log(`Using tolerance ${bestTolerance} which creates ${bestGroupCount} row groups`);

    textItems.forEach(item => {
      const y = Math.round(item.transform[5] / bestTolerance) * bestTolerance;
      
      if (!rowGroups.has(y)) {
        rowGroups.set(y, []);
      }
      rowGroups.get(y)!.push(item);
    });

    return new Map([...rowGroups.entries()].sort((a, b) => b[0] - a[0]));
  }

  /**
   * Enhanced column position detection
   */
  private detectColumnPositionsEnhanced(textItems: any[]): number[] {
    const xPositions = textItems.map(item => item.transform[4]);
    const uniqueX = [...new Set(xPositions)].sort((a, b) => a - b);
    
    const tolerances = [10, 15, 20, 25, 30];
    let bestColumns: number[] = [];
    
    for (const tolerance of tolerances) {
      const columns: number[] = [];
      
      uniqueX.forEach(x => {
        const existing = columns.find(col => Math.abs(col - x) < tolerance);
        if (!existing) {
          columns.push(x);
        }
      });
      
      if (columns.length >= 3 && columns.length <= 8) {
        bestColumns = columns;
        console.log(`Tolerance ${tolerance} gives ${columns.length} columns:`, columns);
        break;
      }
    }

    if (bestColumns.length === 0) {
      const tolerance = tolerances[0];
      uniqueX.forEach(x => {
        const existing = bestColumns.find(col => Math.abs(col - x) < tolerance);
        if (!existing) {
          bestColumns.push(x);
        }
      });
    }

    return bestColumns.sort((a, b) => a - b);
  }

  /**
   * Enhanced cell assignment with better text combination
   */
  private assignItemsToCellsEnhanced(items: any[], columnPositions: number[]): TableCell[] {
    const cells: TableCell[] = [];
    const tolerance = 25;

    items.sort((a, b) => a.transform[4] - b.transform[4]);

    columnPositions.forEach((colX, index) => {
      const cellItems = items.filter(item => {
        const itemX = item.transform[4];
        
        const distances = columnPositions.map(pos => Math.abs(itemX - pos));
        const minDistance = Math.min(...distances);
        const closestColumnIndex = distances.indexOf(minDistance);
        
        return closestColumnIndex === index && minDistance < tolerance;
      });

      if (cellItems.length > 0) {
        cellItems.sort((a, b) => a.transform[4] - b.transform[4]);
        const text = cellItems.map(item => item.str).join(' ').trim();
        
        cells.push({
          text: text,
          x: colX,
          y: items[0]?.transform[5] || 0,
          width: 0,
          height: 0
        });
      } else {
        cells.push({
          text: '',
          x: colX,
          y: items[0]?.transform[5] || 0,
          width: 0,
          height: 0
        });
      }
    });

    return cells;
  }

  /**
   * Enhanced header detection
   */
  private looksLikeHeaderEnhanced(cells: TableCell[]): boolean {
    const headerKeywords = [
      'date', 'narrative', 'debit', 'credit', 'balance', 'transaction', 'value',
      'montant', 'libelle', 'designation', 'solde', 'operation', 'mouvement',
      'ref', 'reference', 'description', 'amount', 'type', 'details', 'débit', 'crédit'
    ];
    
    const cellTexts = cells.map(c => c.text.toLowerCase()).join(' ');
    
    const hasKeywords = headerKeywords.some(keyword => cellTexts.includes(keyword));
    
    const hasTextCells = cells.some(cell => 
      cell.text.length > 3 && 
      /[a-zA-Z]/.test(cell.text) && 
      !/^\d+$/.test(cell.text)
    );
    
    return hasKeywords || hasTextCells;
  }

  /**
   * Validate and clean transactions
   */
  private validateAndCleanTransactions(transactions: any[]): any[] {
    const validTransactions = transactions.filter(transaction => {
      const debitAmount = Math.abs(transaction.debit || 0);
      const creditAmount = Math.abs(transaction.credit || 0);
      const totalAmount = debitAmount + creditAmount;
      
      if (totalAmount < 0.01) {
        console.warn('Rejected transaction with zero amount:', transaction);
        return false;
      }
      
      if (totalAmount > 10000000) {
        console.warn('Rejected transaction with unrealistic amount:', totalAmount, transaction);
        return false;
      }
      
      if (!transaction.date || !/\d{1,2}[-\/]\d{1,2}[-\/]\d{4}/.test(transaction.date)) {
        console.warn('Rejected transaction with invalid date:', transaction);
        return false;
      }
      
      if (!transaction.designation || transaction.designation.trim().length < 3) {
        console.warn('Rejected transaction with invalid designation:', transaction);
        return false;
      }
      
      return true;
    });
    
    console.log(`Validation: ${transactions.length} raw → ${validTransactions.length} valid transactions`);
    return validTransactions;
  }

  /**
   * Strategy 2: Pattern matching on each row (updated with debit/credit logic)
   */
  private extractWithRowPatternMatching(tableStructure: TableStructure): any[] {
    const transactions: any[] = [];
    
    tableStructure.rows.forEach((row, index) => {
      const rowText = row.rawText;
      
      const targetDesignations = this.getTargetDesignations();
      
      for (const designation of targetDesignations) {
        if (rowText.toUpperCase().includes(designation.toUpperCase())) {
          const dateMatch = rowText.match(/\d{1,2}[-\/]\d{1,2}[-\/]\d{4}/);
          if (dateMatch) {
            const amountMatches = this.extractValidAmounts(rowText);
            
            if (amountMatches.length > 0) {
              const amount = amountMatches[0];
              
              if (amount > 0 && amount <= 10000000) {
                // Determine if it's debit or credit based on designation
                let debit = 0;
                let credit = 0;
                
                if (this.isLikelyCredit(designation)) {
                  credit = amount;
                } else {
                  debit = amount;
                }
                
                transactions.push({
                  date: dateMatch[0],
                  designation: designation,
                  debit: debit,
                  credit: credit,
                  montant: credit - debit
                });
                
                console.log('✓ Pattern match found:', {
                  date: dateMatch[0],
                  designation: designation,
                  debit: debit,
                  credit: credit
                });
              }
            }
          }
        }
      }
    });
    
    return transactions;
  }

  /**
   * Strategy 3: Flexible text search (updated with debit/credit logic)
   */
  private extractWithFlexibleSearch(tableStructure: TableStructure): any[] {
    const transactions: any[] = [];
    const allText = tableStructure.rawText;
    
    const targetDesignations = this.getTargetDesignations();
    const designationPattern = targetDesignations.join('|');

    const patterns = [
      new RegExp(`(\\d{1,2}[-\/]\\d{1,2}[-\/]\\d{4})\\s+.*?(${designationPattern}).*?\\s+([\\d,]{1,10}\\.\\d{2})(?!\\d)`, 'gi'),
      new RegExp(`(${designationPattern}).*?(\\d{1,2}[-\/]\\d{1,2}[-\/]\\d{4}).*?\\s+([\\d,]{1,10}\\.\\d{2})(?!\\d)`, 'gi')
    ];

    patterns.forEach((pattern, patternIndex) => {
      let match;
      while ((match = pattern.exec(allText)) !== null) {
        let date, designation, amountStr;
        
        if (patternIndex === 0) {
          [, date, designation, amountStr] = match;
        } else {
          [, designation, date, amountStr] = match;
        }
        
        const amount = this.parseAmountEnhanced(amountStr);
        if (amount > 0 && amount <= 10000000) {
          // Determine if it's debit or credit
          let debit = 0;
          let credit = 0;
          
          if (this.isLikelyCredit(designation)) {
            credit = amount;
          } else {
            debit = amount;
          }
          
          transactions.push({
            date: date,
            designation: designation,
            debit: debit,
            credit: credit,
            montant: credit - debit
          });
          
          console.log(`✓ Flexible pattern found:`, {
            date: date,
            designation: designation,
            debit: debit,
            credit: credit
          });
        }
      }
    });
    
    return transactions;
  }

  /**
   * Extract valid amounts from text
   */
  private extractValidAmounts(text: string): number[] {
    const amountPattern = /\b(\d{1,3}(?:,\d{3})*\.\d{2}|\d{1,7}\.\d{2})\b/g;
    const matches = text.match(amountPattern) || [];
    
    return matches
      .map(match => this.parseAmountEnhanced(match))
      .filter(amount => amount > 0 && amount <= 10000000);
  }

  /**
   * Check if text is a valid amount format
   */
  private isValidAmountFormat(text: string): boolean {
    const cleanText = text.trim();
    
    const validPatterns = [
      /^\d{1,3}(?:,\d{3})*\.\d{2}$/,
      /^\d{1,7}\.\d{2}$/,
      /^\d{1,10}$/
    ];
    
    return validPatterns.some(pattern => pattern.test(cleanText));
  }

  /**
   * Check if text is primarily an amount
   */
  private isAmountOnly(text: string): boolean {
    return this.isValidAmountFormat(text.trim());
  }

  /**
   * Enhanced amount parsing with strict validation
   */
  private parseAmountEnhanced(text: string): number {
    if (!text || text.trim() === '') return 0;
    
    const cleanText = text.trim();
    
    try {
      if (/^\d{1,3}(?:,\d{3})*\.\d{2}$/.test(cleanText)) {
        const withoutCommas = cleanText.replace(/,/g, '');
        return parseFloat(withoutCommas);
      } else if (/^\d{1,7}\.\d{2}$/.test(cleanText)) {
        return parseFloat(cleanText);
      } else if (/^\d{1,10}$/.test(cleanText)) {
        return parseFloat(cleanText);
      } else {
        console.warn('Rejected invalid amount format:', cleanText);
        return 0;
      }
    } catch (error) {
      console.warn('Failed to parse amount:', text, error);
      return 0;
    }
  }

  /**
   * Check if text contains target designation
   */
  private isTargetDesignation(text: string): boolean {
    const targetDesignations = this.getTargetDesignations();
    const upperText = text.toUpperCase();
    
    return targetDesignations.some(target => 
      upperText.includes(target.toUpperCase()) ||
      this.fuzzyMatch(upperText, target.toUpperCase())
    );
  }

  /**
   * Fuzzy matching for designations
   */
  private fuzzyMatch(text: string, target: string): boolean {
    const words = target.split(' ');
    return words.every(word => text.includes(word));
  }

  /**
   * Get target designations
   */
  private getTargetDesignations(): string[] {
    return [
      'PYT FPT',
      'TRSF',
      'PMT TOURISME',
      'FPT INVESTISSEMENT',
      'ONT FICHE STATISTIQUES',
      'APPUI ADM DU TOURISME',
      'ICCN',
      'SITE TOURISTIQUE',
      'COMITE DE SUIVI ET VALIDATION',
      'ONT CONTROLE ET INSPECTION DES UNITES TOURISTIQUES'
    ];
  }

  /**
   * Alternative extraction method using regex on structured text
   */
  extractTransactionsWithRegexOnStructuredText(tableStructure: TableStructure): any[] {
    console.log('=== REGEX ON STRUCTURED TEXT ===');
    
    const transactions: any[] = [];
    
    const allText = tableStructure.rows
      .map(row => row.rawText)
      .join('\n');
    
    const targetDesignations = this.getTargetDesignations();
    const designationPattern = targetDesignations.join('|');

    const transactionRegex = new RegExp(
      `(\\d{1,2}[-\/]\\d{1,2}[-\/]\\d{4}).*?(${designationPattern}).*?` +
        `\\s+([\\d,]{1,10}\\.\\d{2})(?!\\d)`,
      'gi'
    );

    let match;
    while ((match = transactionRegex.exec(allText)) !== null) {
      const amount = this.parseAmountEnhanced(match[3]);
      
      if (amount > 0 && amount <= 10000000) {
        // Determine debit/credit based on designation
        let debit = 0;
        let credit = 0;
        
        if (this.isLikelyCredit(match[2])) {
          credit = amount;
        } else {
          debit = amount;
        }
        
        transactions.push({
          date: match[1],
          designation: match[2],
          debit: debit,
          credit: credit,
          montant: credit - debit
        });
        
        console.log('✓ Regex found:', {
          date: match[1],
          designation: match[2],
          debit: debit,
          credit: credit
        });
      }
    }
    
    return this.validateAndCleanTransactions(transactions);
  }
}