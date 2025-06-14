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

    // Group text items by Y position (rows)
    const rowGroups = this.groupItemsByRow(textItems);
    
    // Analyze column positions
    const columnPositions = this.detectColumnPositions(textItems);
    
    // Build table structure
    const rows: TableRow[] = [];
    let headers: string[] = [];

    for (const [y, items] of rowGroups) {
      const cells = this.assignItemsToCells(items, columnPositions);
      const row: TableRow = {
        y: y,
        cells: cells,
        cellCount: cells.length
      };
      
      rows.push(row);
      
      // Try to detect headers (usually first few rows)
      if (rows.length <= 3 && this.looksLikeHeader(cells)) {
        headers = cells.map(cell => cell.text);
      }
    }

    return {
      headers,
      rows,
      columnPositions
    };
  }

  /**
   * Group text items by Y position (rows)
   */
  private groupItemsByRow(textItems: any[]): Map<number, any[]> {
    const rowGroups = new Map<number, any[]>();
    const tolerance = 2; // Y position tolerance for same row

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
    const tolerance = 10;
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
    const tolerance = 15;

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
          width: 0, // Could be calculated if needed
          height: 0  // Could be calculated if needed
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
   * Check if a row looks like a header
   */
  private looksLikeHeader(cells: TableCell[]): boolean {
    const headerKeywords = ['date', 'narrative', 'debit', 'credit', 'balance', 'transaction', 'value'];
    
    return cells.some(cell => 
      headerKeywords.some(keyword => 
        cell.text.toLowerCase().includes(keyword)
      )
    );
  }

  /**
   * Extract transactions using table structure
   */
  extractTransactionsFromTable(tableStructure: TableStructure): any[] {
    const transactions: any[] = [];
    
    // Find column indices for the 5-column structure
    const transactionDateCol = this.findColumnIndex(tableStructure.headers, ['transaction date', 'trans date']);
    const valueDateCol = this.findColumnIndex(tableStructure.headers, ['value date']);
    const narrativeCol = this.findColumnIndex(tableStructure.headers, ['narrative', 'description']);
    const debitCol = this.findColumnIndex(tableStructure.headers, ['debit']);
    const creditCol = this.findColumnIndex(tableStructure.headers, ['credit']);

    console.log('Column mapping:', { 
      transactionDateCol, 
      valueDateCol, 
      narrativeCol, 
      debitCol, 
      creditCol 
    });
    console.log('Headers found:', tableStructure.headers);

    // If we can't find the expected columns, try positional mapping
    // Based on your description: "Transaction Date", "Value Date", "Narrative", "Debit", "Credit"
    const finalMapping = {
      dateCol: transactionDateCol >= 0 ? transactionDateCol : 0,
      narrativeCol: narrativeCol >= 0 ? narrativeCol : 2,
      debitCol: debitCol >= 0 ? debitCol : 3,
      creditCol: creditCol >= 0 ? creditCol : 4
    };

    console.log('Final column mapping:', finalMapping);

    // Process data rows (skip header rows)
    const dataRows = tableStructure.rows.slice(1); // Skip first row (header)

    dataRows.forEach((row, index) => {
      if (row.cellCount >= 5) { // Must have all 5 columns
        console.log(`Processing row ${index + 1}:`, row.cells.map(c => `"${c.text}"`));
        
        const date = row.cells[finalMapping.dateCol]?.text || '';
        const narrative = row.cells[finalMapping.narrativeCol]?.text || '';
        const debitText = row.cells[finalMapping.debitCol]?.text || '';
        const creditText = row.cells[finalMapping.creditCol]?.text || '';

        console.log(`  Date: "${date}"`);
        console.log(`  Narrative: "${narrative}"`);
        console.log(`  Debit text: "${debitText}"`);
        console.log(`  Credit text: "${creditText}"`);

        // Parse amounts - be more careful about empty cells
        const debit = this.parseAmount(debitText);
        const credit = this.parseAmount(creditText);

        console.log(`  Parsed debit: ${debit}`);
        console.log(`  Parsed credit: ${credit}`);

        // Only add if we have meaningful data
        if (date && narrative && (debit > 0 || credit > 0)) {
          const transaction = {
            date: date,
            designation: narrative,
            debit: debit,
            credit: credit,
            montant: credit - debit // Net amount (positive for credit, negative for debit)
          };
          
          console.log(`  ✅ Adding transaction:`, transaction);
          transactions.push(transaction);
        } else {
          console.log(`  ❌ Skipping row - insufficient data`);
        }
      } else {
        console.log(`Row ${index + 1} has only ${row.cellCount} cells, expected 5`);
      }
    });

    console.log(`Total transactions extracted: ${transactions.length}`);
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
   * Parse amount from text - improved to handle empty cells properly
   */
  private parseAmount(text: string): number {
    if (!text || text.trim() === '' || text.trim() === '-') {
      return 0;
    }
    
    // Remove any non-numeric characters except commas and decimals
    const cleanText = text.replace(/[^\d,.-]/g, '');
    
    if (!cleanText || cleanText === '') {
      return 0;
    }
    
    try {
      if (cleanText.includes('.')) {
        const parts = cleanText.split('.');
        const integerPart = parts[0].replace(/,/g, '');
        const decimalPart = parts[1];
        return parseFloat(`${integerPart}.${decimalPart}`) || 0;
      } else {
        return parseFloat(cleanText.replace(/,/g, '')) || 0;
      }
    } catch (error) {
      console.warn(`Failed to parse amount: "${text}"`, error);
      return 0;
    }
  }
}