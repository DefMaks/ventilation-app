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
    console.log('Raw PDF text:', rawText);

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
    
    console.log('All unique X positions:', uniqueX.slice(0, 20)); // Show first 20
    
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
    
    console.log('=== TRANSACTION EXTRACTION END ===');
    console.log('Final transactions found:', transactions);
    
    return transactions;
  }

  /**
   * Strategy 1: Structured table analysis
   */
  private extractWithStructuredAnalysis(tableStructure: TableStructure): any[] {
    const transactions: any[] = [];
    const datePattern = /\d{1,2}[-\/]\d{1,2}[-\/]\d{4}/;
    const amountPattern = /[\d,]+\.?\d*/;
    
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
        // Find amount cells
        const amountCells = row.cells.filter(cell => 
          this.isAmountOnly(cell.text) && this.parseAmountEnhanced(cell.text) > 0
        );
        
        if (amountCells.length > 0) {
          const amount = this.parseAmountEnhanced(amountCells[0].text);
          
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
            // Look for amounts
            const amountMatches = rowText.match(/[\d,]+\.?\d*/g);
            if (amountMatches) {
              const amounts = amountMatches
                .map(match => this.parseAmountEnhanced(match))
                .filter(amount => amount > 0);
              
              if (amounts.length > 0) {
                transactions.push({
                  date: dateMatch[0],
                  designation: designation,
                  debit: amounts[0],
                  credit: 0,
                  montant: -amounts[0]
                });
                
                console.log('✓ Pattern match found:', {
                  date: dateMatch[0],
                  designation: designation,
                  amount: amounts[0]
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
    
    console.log('Flexible search on text:', allText.substring(0, 500) + '...');
    
    const targetDesignations = this.getTargetDesignations();
    const designationPattern = targetDesignations.join('|');

    // More flexible regex
    const patterns = [
      // Pattern 1: date designation amount
      new RegExp(`(\\d{1,2}[-\/]\\d{1,2}[-\/]\\d{4}).*?(${designationPattern}).*?([\\d,]+\\.?\\d*)`, 'gi'),
      // Pattern 2: designation date amount
      new RegExp(`(${designationPattern}).*?(\\d{1,2}[-\/]\\d{1,2}[-\/]\\d{4}).*?([\\d,]+\\.?\\d*)`, 'gi'),
      // Pattern 3: amount designation date
      new RegExp(`([\\d,]+\\.?\\d*).*?(${designationPattern}).*?(\\d{1,2}[-\/]\\d{1,2}[-\/]\\d{4})`, 'gi')
    ];

    patterns.forEach((pattern, patternIndex) => {
      console.log(`Trying pattern ${patternIndex + 1}...`);
      let match;
      while ((match = pattern.exec(allText)) !== null) {
        let date, designation, amountStr;
        
        if (patternIndex === 0) {
          [, date, designation, amountStr] = match;
        } else if (patternIndex === 1) {
          [, designation, date, amountStr] = match;
        } else {
          [, amountStr, designation, date] = match;
        }
        
        const amount = this.parseAmountEnhanced(amountStr);
        if (amount > 0) {
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
        }
      }
    });
    
    return transactions;
  }

  /**
   * Check if text is primarily an amount
   */
  private isAmountOnly(text: string): boolean {
    const cleanText = text.replace(/[^\d,.-]/g, '');
    return cleanText.length > 0 && cleanText.length >= text.length * 0.7;
  }

  /**
   * Enhanced amount parsing
   */
  private parseAmountEnhanced(text: string): number {
    if (!text || text.trim() === '') return 0;
    
    // Remove any non-numeric characters except commas and decimals
    const cleanText = text.replace(/[^\d,.-]/g, '');
    
    if (!cleanText) return 0;
    
    try {
      // Handle different number formats
      if (cleanText.includes('.') && cleanText.includes(',')) {
        // Format like 1,234.56
        const parts = cleanText.split('.');
        if (parts.length === 2 && parts[1].length <= 2) {
          const integerPart = parts[0].replace(/,/g, '');
          return parseFloat(`${integerPart}.${parts[1]}`);
        }
      } else if (cleanText.includes('.')) {
        // Format like 1234.56 or 1.234 (European)
        const parts = cleanText.split('.');
        if (parts.length === 2) {
          if (parts[1].length <= 2) {
            // Decimal format: 1234.56
            const integerPart = parts[0].replace(/,/g, '');
            return parseFloat(`${integerPart}.${parts[1]}`);
          } else {
            // Thousands separator: 1.234
            return parseFloat(cleanText.replace(/\./g, '').replace(/,/g, '.'));
          }
        }
      } else if (cleanText.includes(',')) {
        // Format like 1,234 (thousands) or 1234,56 (European decimal)
        const parts = cleanText.split(',');
        if (parts.length === 2 && parts[1].length <= 2) {
          // European decimal: 1234,56
          return parseFloat(`${parts[0]}.${parts[1]}`);
        } else {
          // Thousands separator: 1,234
          return parseFloat(cleanText.replace(/,/g, ''));
        }
      } else {
        // Simple integer
        return parseFloat(cleanText);
      }
    } catch (error) {
      console.warn('Failed to parse amount:', text, error);
      return 0;
    }
    
    return 0;
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
    
    console.log('Combined structured text:', allText);
    
    // Use enhanced regex approach
    const targetDesignations = this.getTargetDesignations();
    const designationPattern = targetDesignations.join('|');

    const transactionRegex = new RegExp(
      `(\\d{1,2}[-\/]\\d{1,2}[-\/]\\d{4}).*?(${designationPattern}).*?` +
        `([\\d,]+\\.?\\d*)(?:\\s+([\\d,]+\\.?\\d*))?`,
      'gi'
    );

    let match;
    while ((match = transactionRegex.exec(allText)) !== null) {
      const amount1 = this.parseAmountEnhanced(match[3]);
      const amount2 = match[4] ? this.parseAmountEnhanced(match[4]) : 0;
      
      if (amount1 > 0) {
        transactions.push({
          date: match[1],
          designation: match[2],
          debit: amount1,
          credit: 0,
          montant: -amount1
        });
        
        console.log('✓ Regex found:', {
          date: match[1],
          designation: match[2],
          amount: amount1
        });
      }
    }
    
    return transactions;
  }
}