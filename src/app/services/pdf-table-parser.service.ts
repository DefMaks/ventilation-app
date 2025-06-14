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
}

export interface TableStructure {
  headers: string[];
  rows: TableRow[];
  columnPositions: number[];
  rawText: string; // Add raw text for debugging
}

@Injectable({
  providedIn: 'root'
})
export class PdfTableParserService {

  constructor() { }

  /**
   * Analyze table structure from PDF page
   */
  async analyzeTableStructure(page: any): Promise<TableStructure> {
    const content = await page.getTextContent();
    const textItems = content.items;

    // Get raw text for debugging
    const rawText = textItems.map((item: any) => item.str).join(' ');
    console.log('Raw PDF text:', rawText);

    // Group text items by Y position (rows)
    const rowGroups = this.groupItemsByRow(textItems);
    console.log('Row groups found:', rowGroups.size);
    
    // Analyze column positions
    const columnPositions = this.detectColumnPositions(textItems);
    console.log('Column positions:', columnPositions);
    
    // Build table structure
    const rows: TableRow[] = [];
    let headers: string[] = [];

    let rowIndex = 0;
    for (const [y, items] of rowGroups) {
      const cells = this.assignItemsToCells(items, columnPositions);
      const row: TableRow = {
        y: y,
        cells: cells,
        cellCount: cells.length
      };
      
      console.log(`Row ${rowIndex} (y=${y}):`, cells.map(c => c.text));
      rows.push(row);
      
      // Try to detect headers (usually first few rows)
      if (rows.length <= 5 && this.looksLikeHeader(cells)) {
        headers = cells.map(cell => cell.text);
        console.log('Detected headers:', headers);
      }
      
      rowIndex++;
    }

    return {
      headers,
      rows,
      columnPositions,
      rawText
    };
  }

  /**
   * Group text items by Y position (rows)
   */
  private groupItemsByRow(textItems: any[]): Map<number, any[]> {
    const rowGroups = new Map<number, any[]>();
    const tolerance = 3; // Increased tolerance for Y position

    textItems.forEach(item => {
      const y = Math.round(item.transform[5] / tolerance) * tolerance;
      
      if (!rowGroups.has(y)) {
        rowGroups.set(y, []);
      }
      rowGroups.get(y)!.push(item);
    });

    // Sort by Y position (top to bottom)
    return new Map([...rowGroups.entries()].sort((a, b) => b[0] - a[0]));
  }

  /**
   * Detect column positions based on X coordinates
   */
  private detectColumnPositions(textItems: any[]): number[] {
    const xPositions = textItems.map(item => item.transform[4]);
    const uniqueX = [...new Set(xPositions)].sort((a, b) => a - b);
    
    // Group similar X positions (within tolerance)
    const tolerance = 15; // Increased tolerance
    const columns: number[] = [];
    
    uniqueX.forEach(x => {
      const existing = columns.find(col => Math.abs(col - x) < tolerance);
      if (!existing) {
        columns.push(x);
      }
    });

    return columns.sort((a, b) => a - b);
  }

  /**
   * Assign text items to table cells based on column positions
   */
  private assignItemsToCells(items: any[], columnPositions: number[]): TableCell[] {
    const cells: TableCell[] = [];
    const tolerance = 20; // Increased tolerance

    // Sort items by X position
    items.sort((a, b) => a.transform[4] - b.transform[4]);

    // Initialize cells for each column
    columnPositions.forEach((colX, index) => {
      const cellItems = items.filter(item => {
        const itemX = item.transform[4];
        return Math.abs(itemX - colX) < tolerance;
      });

      if (cellItems.length > 0) {
        // Combine text from multiple items in same cell
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
   * Check if a row looks like a header - more flexible detection
   */
  private looksLikeHeader(cells: TableCell[]): boolean {
    const headerKeywords = [
      'date', 'narrative', 'debit', 'credit', 'balance', 'transaction', 'value',
      'montant', 'libelle', 'designation', 'solde', 'operation', 'mouvement'
    ];
    
    const cellTexts = cells.map(c => c.text.toLowerCase()).join(' ');
    
    return headerKeywords.some(keyword => cellTexts.includes(keyword)) ||
           cells.some(cell => cell.text.length > 5 && /[a-zA-Z]/.test(cell.text));
  }

  /**
   * Extract transactions using table structure - more flexible approach
   */
  extractTransactionsFromTable(tableStructure: TableStructure): any[] {
    const transactions: any[] = [];
    
    console.log('Starting transaction extraction...');
    console.log('Total rows:', tableStructure.rows.length);
    
    // Try different approaches to find data
    
    // Approach 1: Look for date patterns in any column
    const datePattern = /\d{2}[-\/]\d{2}[-\/]\d{4}/;
    const amountPattern = /[\d,]+\.?\d*/;
    
    tableStructure.rows.forEach((row, index) => {
      const rowText = row.cells.map(c => c.text).join(' ');
      console.log(`Analyzing row ${index}:`, row.cells.map(c => c.text));
      
      // Look for date in any cell
      const dateCell = row.cells.find(cell => datePattern.test(cell.text));
      if (dateCell) {
        console.log('Found date cell:', dateCell.text);
        
        // Look for designation/narrative (usually longest text cell)
        const narrativeCell = row.cells
          .filter(cell => cell.text.length > 5 && !datePattern.test(cell.text) && !amountPattern.test(cell.text))
          .sort((a, b) => b.text.length - a.text.length)[0];
        
        // Look for amounts
        const amountCells = row.cells.filter(cell => 
          amountPattern.test(cell.text) && cell.text.length > 1
        );
        
        console.log('Narrative cell:', narrativeCell?.text);
        console.log('Amount cells:', amountCells.map(c => c.text));
        
        if (narrativeCell && amountCells.length > 0) {
          // Parse amounts
          const amounts = amountCells.map(cell => this.parseAmount(cell.text)).filter(amt => amt > 0);
          
          if (amounts.length > 0) {
            // For now, assume first amount is the transaction amount
            const amount = amounts[0];
            
            // Check if it's a target designation
            const targetDesignations = [
              'PYT FPT', 'TRSF', 'PMT TOURISME', 'FPT INVESTISSEMENT',
              'ONT FICHE STATISTIQUES', 'APPUI ADM DU TOURISME', 'ICCN',
              'SITE TOURISTIQUE', 'COMITE DE SUIVI ET VALIDATION',
              'ONT CONTROLE ET INSPECTION DES UNITES TOURISTIQUES'
            ];
            
            const isTargetDesignation = targetDesignations.some(target => 
              narrativeCell.text.toUpperCase().includes(target.toUpperCase())
            );
            
            if (isTargetDesignation) {
              console.log('Found target transaction:', {
                date: dateCell.text,
                designation: narrativeCell.text,
                amount: amount
              });
              
              transactions.push({
                date: dateCell.text,
                designation: narrativeCell.text,
                debit: amount, // Assume it's a debit (expense)
                credit: 0,
                montant: -amount // Negative for debit
              });
            }
          }
        }
      }
    });
    
    console.log('Extracted transactions:', transactions);
    return transactions;
  }

  /**
   * Find column index by header keywords
   */
  private findColumnIndex(headers: string[], keywords: string[]): number {
    return headers.findIndex(header => 
      keywords.some(keyword => 
        header.toLowerCase().includes(keyword.toLowerCase())
      )
    );
  }

  /**
   * Parse amount from text - enhanced
   */
  private parseAmount(text: string): number {
    if (!text || text.trim() === '') return 0;
    
    // Remove any non-numeric characters except commas and decimals
    const cleanText = text.replace(/[^\d,.-]/g, '');
    
    if (!cleanText) return 0;
    
    try {
      if (cleanText.includes('.')) {
        const parts = cleanText.split('.');
        const integerPart = parts[0].replace(/,/g, '');
        const decimalPart = parts[1];
        return parseFloat(`${integerPart}.${decimalPart}`);
      } else {
        return parseFloat(cleanText.replace(/,/g, ''));
      }
    } catch (error) {
      console.warn('Failed to parse amount:', text, error);
      return 0;
    }
  }

  /**
   * Alternative extraction method using regex on structured text
   */
  extractTransactionsWithRegexOnStructuredText(tableStructure: TableStructure): any[] {
    const transactions: any[] = [];
    
    // Combine all row texts
    const allText = tableStructure.rows
      .map(row => row.cells.map(c => c.text).join(' '))
      .join('\n');
    
    console.log('Combined text for regex:', allText);
    
    // Use the original regex approach on the structured text
    const targetDesignations = [
      'PYT FPT', 'TRSF', 'PMT TOURISME', 'FPT INVESTISSEMENT',
      'ONT FICHE STATISTIQUES', 'APPUI ADM DU TOURISME', 'ICCN',
      'SITE TOURISTIQUE', 'COMITE DE SUIVI ET VALIDATION',
      'ONT CONTROLE ET INSPECTION DES UNITES TOURISTIQUES'
    ];
    const designationPattern = targetDesignations.join('|');

    const transactionRegex = new RegExp(
      `(\\d{2}[-\/]\\d{2}[-\/]\\d{4}).*?(${designationPattern}).*?` +
        `([\\d,]+\\.\\d{2})(?:\\s+([\\d,]+\\.\\d{2}))?`,
      'gi'
    );

    let match;
    while ((match = transactionRegex.exec(allText)) !== null) {
      const amount1 = this.parseAmount(match[3]);
      const amount2 = match[4] ? this.parseAmount(match[4]) : 0;
      
      transactions.push({
        date: match[1],
        designation: match[2],
        debit: amount1,
        credit: 0,
        montant: -amount1
      });
    }
    
    return transactions;
  }
}