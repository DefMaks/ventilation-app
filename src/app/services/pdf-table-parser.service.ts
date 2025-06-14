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
  rawText: string; // Add raw text for each row
}

export interface TableStructure {
  headers: string[];
  rows: TableRow[];
  columnPositions: number[];
  rawText: string;
  allTextItems: any[]; // Store all text items for debugging
}

@Injectable({
  providedIn: 'root'
})
export class PdfTableParserService {

  constructor() { }

  /**
   * Analyze table structure from PDF page - Enhanced version
   */
  async analyzeTableStructure(page: any): Promise<TableStructure> {
    const content = await page.getTextContent();
    const textItems = content.items;

    // Get raw text for debugging
    const rawText = textItems.map((item: any) => item.str).join(' ');
    console.log('=== PDF ANALYSIS START ===');
    console.log('Total text items found:', textItems.length);
    console.log('Raw PDF text (first 500 chars):', rawText.substring(0, 500));

    // Show first 10 text items with positions
    console.log('First 10 text items with positions:');
    textItems.slice(0, 10).forEach((item: any, index: number) => {
      console.log(`${index}: "${item.str}" at (${item.transform[4]}, ${item.transform[5]})`);
    });

    // Group text items by Y position (rows) with more flexible tolerance
    const rowGroups = this.groupItemsByRowEnhanced(textItems);
    console.log('Row groups found:', rowGroups.size);
    
    // Analyze column positions with enhanced detection
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
      
      // Try to detect headers (usually first few rows)
      if (rows.length <= 5 && this.looksLikeHeaderEnhanced(cells)) {
        headers = cells.map(cell => cell.text);
        console.log('Detected headers:', headers);
      }
      
      rowIndex++;
    }

    console.log('=== PDF ANALYSIS END ===');

    return {
      headers,
      rows,
      columnPositions,
      rawText,
      allTextItems: textItems
    };
  }

  /**
   * Enhanced row grouping with multiple tolerance levels
   */
  private groupItemsByRowEnhanced(textItems: any[]): Map<number, any[]> {
    const rowGroups = new Map<number, any[]>();
    
    // Try multiple tolerance levels
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

      // Prefer tolerance that creates reasonable number of groups
      if (testGroups.size > bestGroupCount && testGroups.size < textItems.length / 2) {
        bestGroupCount = testGroups.size;
        bestTolerance = tolerance;
      }
    }

    console.log(`Using tolerance ${bestTolerance} which creates ${bestGroupCount} row groups`);

    // Apply best tolerance
    textItems.forEach(item => {
      const y = Math.round(item.transform[5] / bestTolerance) * bestTolerance;
      
      if (!rowGroups.has(y)) {
        rowGroups.set(y, []);
      }
      rowGroups.get(y)!.push(item);
    });

    // Sort by Y position (top to bottom)
    return new Map([...rowGroups.entries()].sort((a, b) => b[0] - a[0]));
  }

  /**
   * Enhanced column position detection
   */
  private detectColumnPositionsEnhanced(textItems: any[]): number[] {
    const xPositions = textItems.map(item => item.transform[4]);
    const uniqueX = [...new Set(xPositions)].sort((a, b) => a - b);
    
    console.log('All unique X positions (first 20):', uniqueX.slice(0, 20));
    
    // Try multiple tolerance levels for column grouping
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
      
      // Prefer 3-6 columns (typical for bank statements)
      if (columns.length >= 3 && columns.length <= 8) {
        bestColumns = columns;
        console.log(`Tolerance ${tolerance} gives ${columns.length} columns:`, columns);
        break;
      }
    }

    if (bestColumns.length === 0) {
      // Fallback: use first tolerance
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
    const tolerance = 25; // Increased tolerance

    // Sort items by X position
    items.sort((a, b) => a.transform[4] - b.transform[4]);

    // For each column position, find items that belong to it
    columnPositions.forEach((colX, index) => {
      const cellItems = items.filter(item => {
        const itemX = item.transform[4];
        
        // Check if item is closest to this column
        const distances = columnPositions.map(pos => Math.abs(itemX - pos));
        const minDistance = Math.min(...distances);
        const closestColumnIndex = distances.indexOf(minDistance);
        
        return closestColumnIndex === index && minDistance < tolerance;
      });

      if (cellItems.length > 0) {
        // Sort by X position and combine text
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
        // Empty cell
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
      'ref', 'reference', 'description', 'amount', 'type', 'details'
    ];
    
    const cellTexts = cells.map(c => c.text.toLowerCase()).join(' ');
    
    // Check for header keywords
    const hasKeywords = headerKeywords.some(keyword => cellTexts.includes(keyword));
    
    // Check if cells contain mostly text (not numbers/dates)
    const hasTextCells = cells.some(cell => 
      cell.text.length > 3 && 
      /[a-zA-Z]/.test(cell.text) && 
      !/^\d+$/.test(cell.text)
    );
    
    return hasKeywords || hasTextCells;
  }

  /**
   * Enhanced transaction extraction with multiple strategies
   */
  extractTransactionsFromTable(tableStructure: TableStructure): any[] {
    console.log('=== TRANSACTION EXTRACTION START ===');
    
    let transactions: any[] = [];
    
    // Strategy 1: Structured table analysis
    transactions = this.extractWithStructuredAnalysis(tableStructure);
    console.log('Strategy 1 (Structured) found:', transactions.length, 'transactions');
    
    // Strategy 2: Pattern matching on each row
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
   * Validate and clean transactions to remove unrealistic amounts
   */
  private validateAndCleanTransactions(transactions: any[]): any[] {
    const validTransactions = transactions.filter(transaction => {
      // Check for realistic amounts (between $0.01 and $10,000,000)
      const amount = Math.abs(transaction.montant || transaction.debit || transaction.credit || 0);
      
      if (amount < 0.01) {
        console.warn('Rejected transaction with zero/negative amount:', transaction);
        return false;
      }
      
      if (amount > 10000000) { // 10 million USD limit
        console.warn('Rejected transaction with unrealistic amount:', amount, transaction);
        return false;
      }
      
      // Check for valid date format
      if (!transaction.date || !/\d{1,2}[-\/]\d{1,2}[-\/]\d{4}/.test(transaction.date)) {
        console.warn('Rejected transaction with invalid date:', transaction);
        return false;
      }
      
      // Check for valid designation
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
   * Strategy 1: Structured table analysis
   */
  private extractWithStructuredAnalysis(tableStructure: TableStructure): any[] {
    const transactions: any[] = [];
    const datePattern = /\d{1,2}[-\/]\d{1,2}[-\/]\d{4}/;
    
    tableStructure.rows.forEach((row, index) => {
      console.log(`Analyzing row ${index}:`, row.cells.map(c => `"${c.text}"`));
      
      // Find date cell
      const dateCell = row.cells.find(cell => datePattern.test(cell.text));
      if (!dateCell) return;
      
      // Find narrative/designation cell (longest non-date, non-amount text)
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
        // Find amount cells - be more selective
        const amountCells = row.cells.filter(cell => {
          const cleanText = cell.text.trim();
          return this.isValidAmountFormat(cleanText) && this.parseAmountEnhanced(cleanText) > 0;
        });
        
        if (amountCells.length > 0) {
          const amount = this.parseAmountEnhanced(amountCells[0].text);
          
          // Additional validation for reasonable amounts
          if (amount > 0 && amount <= 10000000) {
            transactions.push({
              date: dateCell.text,
              designation: narrativeCell.text,
              debit: amount,
              credit: 0,
              montant: -amount
            });
            
            console.log('✓ Found transaction:', {
              date: dateCell.text,
              designation: narrativeCell.text,
              amount: amount
            });
          } else {
            console.warn('Rejected unrealistic amount:', amount, 'from text:', amountCells[0].text);
          }
        }
      }
    });
    
    return transactions;
  }

  /**
   * Strategy 2: Pattern matching on each row
   */
  private extractWithRowPatternMatching(tableStructure: TableStructure): any[] {
    const transactions: any[] = [];
    
    tableStructure.rows.forEach((row, index) => {
      const rowText = row.rawText;
      
      // Try to match pattern: date + target designation + amount
      const targetDesignations = this.getTargetDesignations();
      
      for (const designation of targetDesignations) {
        if (rowText.toUpperCase().includes(designation.toUpperCase())) {
          // Look for date in this row
          const dateMatch = rowText.match(/\d{1,2}[-\/]\d{1,2}[-\/]\d{4}/);
          if (dateMatch) {
            // Look for amounts - be more selective
            const amountMatches = this.extractValidAmounts(rowText);
            
            if (amountMatches.length > 0) {
              const amount = amountMatches[0];
              
              if (amount > 0 && amount <= 10000000) {
                transactions.push({
                  date: dateMatch[0],
                  designation: designation,
                  debit: amount,
                  credit: 0,
                  montant: -amount
                });
                
                console.log('✓ Pattern match found:', {
                  date: dateMatch[0],
                  designation: designation,
                  amount: amount
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
   * Strategy 3: Flexible text search across all content
   */
  private extractWithFlexibleSearch(tableStructure: TableStructure): any[] {
    const transactions: any[] = [];
    const allText = tableStructure.rawText;
    
    console.log('Flexible search on text (first 500 chars):', allText.substring(0, 500));
    
    const targetDesignations = this.getTargetDesignations();
    const designationPattern = targetDesignations.join('|');

    // More conservative regex patterns
    const patterns = [
      // Pattern 1: date designation amount (with word boundaries)
      new RegExp(`(\\d{1,2}[-\/]\\d{1,2}[-\/]\\d{4})\\s+.*?(${designationPattern}).*?\\s+([\\d,]{1,10}\\.\\d{2})(?!\\d)`, 'gi'),
      // Pattern 2: designation date amount
      new RegExp(`(${designationPattern}).*?(\\d{1,2}[-\/]\\d{1,2}[-\/]\\d{4}).*?\\s+([\\d,]{1,10}\\.\\d{2})(?!\\d)`, 'gi')
    ];

    patterns.forEach((pattern, patternIndex) => {
      console.log(`Trying pattern ${patternIndex + 1}...`);
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
          transactions.push({
            date: date,
            designation: designation,
            debit: amount,
            credit: 0,
            montant: -amount
          });
          
          console.log(`✓ Flexible pattern ${patternIndex + 1} found:`, {
            date: date,
            designation: designation,
            amount: amount
          });
        } else {
          console.warn(`Rejected amount from pattern ${patternIndex + 1}:`, amount, 'from:', amountStr);
        }
      }
    });
    
    return transactions;
  }

  /**
   * Extract valid amounts from text with better validation
   */
  private extractValidAmounts(text: string): number[] {
    // Look for amounts in format: 1,234.56 or 1234.56
    const amountPattern = /\b(\d{1,3}(?:,\d{3})*\.\d{2}|\d{1,7}\.\d{2})\b/g;
    const matches = text.match(amountPattern) || [];
    
    return matches
      .map(match => this.parseAmountEnhanced(match))
      .filter(amount => amount > 0 && amount <= 10000000); // Reasonable limits
  }

  /**
   * Check if text is a valid amount format
   */
  private isValidAmountFormat(text: string): boolean {
    // Must be primarily digits, commas, and one decimal point
    const cleanText = text.trim();
    
    // Check for valid amount patterns
    const validPatterns = [
      /^\d{1,3}(?:,\d{3})*\.\d{2}$/, // 1,234.56
      /^\d{1,7}\.\d{2}$/,            // 1234.56
      /^\d{1,10}$/                   // 1234 (whole numbers)
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
      // Only handle specific, safe formats
      if (/^\d{1,3}(?:,\d{3})*\.\d{2}$/.test(cleanText)) {
        // Format: 1,234.56
        const withoutCommas = cleanText.replace(/,/g, '');
        return parseFloat(withoutCommas);
      } else if (/^\d{1,7}\.\d{2}$/.test(cleanText)) {
        // Format: 1234.56
        return parseFloat(cleanText);
      } else if (/^\d{1,10}$/.test(cleanText)) {
        // Format: 1234 (whole number)
        return parseFloat(cleanText);
      } else {
        // Reject anything else to avoid parsing errors
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
    
    // Combine all row texts
    const allText = tableStructure.rows
      .map(row => row.rawText)
      .join('\n');
    
    console.log('Combined structured text (first 500 chars):', allText.substring(0, 500));
    
    // Use enhanced regex approach with strict amount validation
    const targetDesignations = this.getTargetDesignations();
    const designationPattern = targetDesignations.join('|');

    const transactionRegex = new RegExp(
      `(\\d{1,2}[-\/]\\d{1,2}[-\/]\\d{4}).*?(${designationPattern}).*?` +
        `\\s+([\\d,]{1,10}\\.\\d{2})(?!\\d)`, // Strict amount format with length limit
      'gi'
    );

    let match;
    while ((match = transactionRegex.exec(allText)) !== null) {
      const amount = this.parseAmountEnhanced(match[3]);
      
      if (amount > 0 && amount <= 10000000) {
        transactions.push({
          date: match[1],
          designation: match[2],
          debit: amount,
          credit: 0,
          montant: -amount
        });
        
        console.log('✓ Regex found:', {
          date: match[1],
          designation: match[2],
          amount: amount
        });
      } else {
        console.warn('Rejected regex amount:', amount, 'from:', match[3]);
      }
    }
    
    return this.validateAndCleanTransactions(transactions);
  }
}