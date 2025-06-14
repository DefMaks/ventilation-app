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

    console.log('🔍 Raw text items found:', textItems.length);
    
    // Log first few items to see what we're working with
    textItems.slice(0, 10).forEach((item, index) => {
      console.log(`Item ${index}: "${item.str}" at (${item.transform[4]}, ${item.transform[5]})`);
    });

    // Group text items by Y position (rows)
    const rowGroups = this.groupItemsByRow(textItems);
    console.log('📊 Row groups found:', rowGroups.size);
    
    // Analyze column positions
    const columnPositions = this.detectColumnPositions(textItems);
    console.log('📋 Column positions detected:', columnPositions);
    
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
      
      rows.push(row);
      
      console.log(`Row ${rowIndex} (y=${y}): ${cells.length} cells -`, cells.map(c => `"${c.text}"`));
      
      // Try to detect headers (usually first few rows)
      if (rows.length <= 3 && this.looksLikeHeader(cells)) {
        headers = cells.map(cell => cell.text);
        console.log('🎯 Headers detected:', headers);
      }
      
      rowIndex++;
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

    console.log('🔍 Unique X positions:', uniqueX.slice(0, 20)); // Show first 20
    console.log('📍 Final columns:', columns);

    return columns.sort((a, b) => a - b);
  }

  /**
   * Assign text items to table cells based on column positions
   */
  private assignItemsToCells(items: any[], columnPositions: number[]): TableCell[] {
    const cells: TableCell[] = [];
    const tolerance = 20; // Increased tolerance

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
   * Check if a row looks like a header
   */
  private looksLikeHeader(cells: TableCell[]): boolean {
    const headerKeywords = ['date', 'narrative', 'debit', 'credit', 'balance', 'transaction', 'value'];
    
    const hasHeaderKeywords = cells.some(cell => 
      headerKeywords.some(keyword => 
        cell.text.toLowerCase().includes(keyword)
      )
    );
    
    console.log('🔍 Checking if header:', cells.map(c => c.text), 'Result:', hasHeaderKeywords);
    return hasHeaderKeywords;
  }

  /**
   * Extract transactions using table structure
   */
  extractTransactionsFromTable(tableStructure: TableStructure): any[] {
    const transactions: any[] = [];
    
    console.log('\n🎯 === STARTING TRANSACTION EXTRACTION ===');
    console.log('Headers:', tableStructure.headers);
    console.log('Total rows:', tableStructure.rows.length);
    
    // Find column indices for the 5-column structure
    const transactionDateCol = this.findColumnIndex(tableStructure.headers, ['transaction date', 'trans date', 'date']);
    const valueDateCol = this.findColumnIndex(tableStructure.headers, ['value date']);
    const narrativeCol = this.findColumnIndex(tableStructure.headers, ['narrative', 'description']);
    const debitCol = this.findColumnIndex(tableStructure.headers, ['debit']);
    const creditCol = this.findColumnIndex(tableStructure.headers, ['credit']);

    console.log('🔍 Column mapping from headers:', { 
      transactionDateCol, 
      valueDateCol, 
      narrativeCol, 
      debitCol, 
      creditCol 
    });

    // If we can't find the expected columns, try positional mapping
    // Based on your description: "Transaction Date", "Value Date", "Narrative", "Debit", "Credit"
    const finalMapping = {
      dateCol: transactionDateCol >= 0 ? transactionDateCol : 0,
      narrativeCol: narrativeCol >= 0 ? narrativeCol : 2,
      debitCol: debitCol >= 0 ? debitCol : 3,
      creditCol: creditCol >= 0 ? creditCol : 4
    };

    console.log('📍 Final column mapping:', finalMapping);

    // Process data rows (skip header rows)
    let dataRows = tableStructure.rows;
    
    // Skip rows that look like headers
    let startIndex = 0;
    for (let i = 0; i < Math.min(3, dataRows.length); i++) {
      if (this.looksLikeHeader(dataRows[i].cells)) {
        startIndex = i + 1;
      }
    }
    
    dataRows = dataRows.slice(startIndex);
    console.log(`📊 Processing ${dataRows.length} data rows (skipped ${startIndex} header rows)`);

    dataRows.forEach((row, index) => {
      console.log(`\n--- Processing row ${index + 1} ---`);
      console.log('Raw cells:', row.cells.map(c => `"${c.text}"`));
      console.log('Cell count:', row.cellCount);
      
      if (row.cellCount >= 3) { // At least date, narrative, and one amount
        const date = row.cells[finalMapping.dateCol]?.text || '';
        const narrative = row.cells[finalMapping.narrativeCol]?.text || '';
        const debitText = row.cells[finalMapping.debitCol]?.text || '';
        const creditText = row.cells[finalMapping.creditCol]?.text || '';

        console.log(`  📅 Date: "${date}"`);
        console.log(`  📝 Narrative: "${narrative}"`);
        console.log(`  💸 Debit text: "${debitText}"`);
        console.log(`  💰 Credit text: "${creditText}"`);

        // Parse amounts with enhanced debugging
        const debitAmount = this.parseAmountWithDebug(debitText, 'DEBIT');
        const creditAmount = this.parseAmountWithDebug(creditText, 'CREDIT');

        console.log(`  ✅ Parsed debit: ${debitAmount}`);
        console.log(`  ✅ Parsed credit: ${creditAmount}`);

        // Check if this is a meaningful transaction row
        const hasValidDate = this.isValidDate(date);
        const hasValidNarrative = narrative.length > 2; // At least 3 characters
        const hasAmount = debitAmount > 0 || creditAmount > 0;

        console.log(`  🔍 Validation - Date: ${hasValidDate}, Narrative: ${hasValidNarrative}, Amount: ${hasAmount}`);

        // Only add if we have meaningful data
        if (hasValidDate && hasValidNarrative && hasAmount) {
          // CRITICAL FIX: Properly assign debit and credit
          let finalDebit = 0;
          let finalCredit = 0;
          let montant = 0;

          // If debit column has value and credit column is empty/zero
          if (debitAmount > 0 && creditAmount === 0) {
            finalDebit = debitAmount;
            finalCredit = 0;
            montant = -debitAmount; // Negative for debit
            console.log(`  🔴 → DEBIT transaction: ${finalDebit}`);
          }
          // If credit column has value and debit column is empty/zero
          else if (creditAmount > 0 && debitAmount === 0) {
            finalDebit = 0;
            finalCredit = creditAmount;
            montant = creditAmount; // Positive for credit
            console.log(`  🟢 → CREDIT transaction: ${finalCredit}`);
          }
          // If both columns have values (unusual but possible)
          else if (debitAmount > 0 && creditAmount > 0) {
            finalDebit = debitAmount;
            finalCredit = creditAmount;
            montant = creditAmount - debitAmount; // Net amount
            console.log(`  🟡 → BOTH debit: ${finalDebit}, credit: ${finalCredit}, net: ${montant}`);
          }
          // If neither column has a value (shouldn't happen if hasAmount is true)
          else {
            console.log(`  ❌ → SKIPPING: No valid amounts found`);
            return;
          }

          const transaction = {
            date: date,
            designation: narrative,
            debit: finalDebit,
            credit: finalCredit,
            montant: montant
          };
          
          console.log(`  ✅ Adding transaction:`, transaction);
          transactions.push(transaction);
        } else {
          console.log(`  ❌ Skipping row - insufficient data`);
        }
      } else {
        console.log(`  ❌ Row has only ${row.cellCount} cells, need at least 3`);
      }
    });

    console.log(`\n🎯 === EXTRACTION COMPLETE ===`);
    console.log(`Total transactions extracted: ${transactions.length}`);
    
    // Summary statistics
    const totalDebits = transactions.reduce((sum, t) => sum + t.debit, 0);
    const totalCredits = transactions.reduce((sum, t) => sum + t.credit, 0);
    console.log(`💸 Total Debits: ${totalDebits.toLocaleString('en-US', {minimumFractionDigits: 2})}`);
    console.log(`💰 Total Credits: ${totalCredits.toLocaleString('en-US', {minimumFractionDigits: 2})}`);
    
    return transactions;
  }

  /**
   * Parse amount with enhanced debugging
   */
  private parseAmountWithDebug(text: string, type: string): number {
    console.log(`    🔍 Parsing ${type}: "${text}"`);
    
    if (!text || text.trim() === '' || text.trim() === '-' || text.trim() === '0.00') {
      console.log(`    ➡️ ${type}: Empty/zero value`);
      return 0;
    }
    
    // Remove any non-numeric characters except commas and decimals
    const cleanText = text.replace(/[^\d,.-]/g, '');
    console.log(`    🧹 ${type}: Cleaned to "${cleanText}"`);
    
    if (!cleanText || cleanText === '' || cleanText === '-') {
      console.log(`    ➡️ ${type}: No numeric content`);
      return 0;
    }
    
    try {
      let result = 0;
      if (cleanText.includes('.')) {
        const parts = cleanText.split('.');
        const integerPart = parts[0].replace(/,/g, '');
        const decimalPart = parts[1];
        result = parseFloat(`${integerPart}.${decimalPart}`) || 0;
        console.log(`    ✅ ${type}: Parsed decimal "${integerPart}.${decimalPart}" = ${result}`);
      } else {
        result = parseFloat(cleanText.replace(/,/g, '')) || 0;
        console.log(`    ✅ ${type}: Parsed integer "${cleanText}" = ${result}`);
      }
      return result;
    } catch (error) {
      console.warn(`    ❌ ${type}: Failed to parse "${text}"`, error);
      return 0;
    }
  }

  /**
   * Check if a string looks like a valid date
   */
  private isValidDate(dateStr: string): boolean {
    if (!dateStr || dateStr.trim() === '') return false;
    
    // Check for common date patterns: DD-MM-YYYY, DD/MM/YYYY, etc.
    const datePatterns = [
      /^\d{1,2}[-\/]\d{1,2}[-\/]\d{4}$/,
      /^\d{4}[-\/]\d{1,2}[-\/]\d{1,2}$/,
      /^\d{1,2}\s+\w+\s+\d{4}$/
    ];
    
    return datePatterns.some(pattern => pattern.test(dateStr.trim()));
  }

  /**
   * Find column index by header keywords
   */
  private findColumnIndex(headers: string[], keywords: string[]): number {
    const index = headers.findIndex(header => 
      keywords.some(keyword => 
        header.toLowerCase().includes(keyword.toLowerCase())
      )
    );
    console.log(`🔍 Looking for ${keywords} in headers, found at index: ${index}`);
    return index;
  }

  /**
   * Parse amount from text - improved to handle empty cells properly
   */
  private parseAmount(text: string): number {
    if (!text || text.trim() === '' || text.trim() === '-' || text.trim() === '0.00') {
      return 0;
    }
    
    // Remove any non-numeric characters except commas and decimals
    const cleanText = text.replace(/[^\d,.-]/g, '');
    
    if (!cleanText || cleanText === '' || cleanText === '-') {
      return 0;
    }
    
    try {
      if (cleanText.includes('.')) {
        const parts = cleanText.split('.');
        const integerPart = parts[0].replace(/,/g, '');
        const decimalPart = parts[1];
        const result = parseFloat(`${integerPart}.${decimalPart}`) || 0;
        return result;
      } else {
        const result = parseFloat(cleanText.replace(/,/g, '')) || 0;
        return result;
      }
    } catch (error) {
      console.warn(`Failed to parse amount: "${text}"`, error);
      return 0;
    }
  }
}