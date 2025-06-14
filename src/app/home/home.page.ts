import { Component } from '@angular/core';
import * as XLSX from 'xlsx';
import * as pdfjsLib from 'pdfjs-dist';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import { ExcelTemplateService, TransactionData } from '../services/excel-template.service';

// Configuration du worker
GlobalWorkerOptions.workerSrc =
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

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

  constructor(private excelTemplateService: ExcelTemplateService) {}

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

      // Pattern optimisé pour vos besoins
      const targetDesignations = [
        'PMT TOURISME',
        'FPT INVESTISSEMENT',
        'ONT FICHE STATISTIQUES',
        'APPUI ADM DU TOURISME',
        'ICCN',
        'SITE TOURISTIQUE',
        'COMITE DE SUIVI ET VALIDATION',
        'ONT CONTROLE ET INSPECTION DES UNITES TOURISTIQUES',
      ];
      const designationPattern = targetDesignations.join('|');

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const text = content.items.map((item: any) => item.str).join(' ');

        // Regex améliorée pour capturer débit OU crédit
        const transactionRegex = new RegExp(
          `(\\d{2}-\\d{2}-\\d{4}).*?(${designationPattern}).*?` +
            `(?:([\\d,.]+)\\s*(?:\\s([\\d,.]+))?)`, // Capture débit et crédit séparément
          'gi'
        );

        let match;
        while ((match = transactionRegex.exec(text)) !== null) {
          // Détermine si le montant est en débit ou crédit
          const debit = match[3]
            ? parseFloat(match[3].replace(/[^\d.-]/g, ''))
            : 0;
          const credit = match[4]
            ? parseFloat(match[4].replace(/[^\d.-]/g, ''))
            : 0;
          const montant = debit !== 0 ? -debit : credit; // Montant négatif si débit

          result.push({
            date: match[1],
            designation: match[2],
            debit: debit,
            credit: credit,
            montant: montant, // Valeur signée (négative pour débits)
          });
        }
      }

      console.log('Transactions extraites:', result);
      this.transactions = result;

      // Validate extracted data
      const validation = this.excelTemplateService.validateData(result);
      if (!validation.isValid) {
        this.validationErrors = validation.errors;
        console.warn('Erreurs de validation:', validation.errors);
      }

    } catch (error) {
      console.error('Erreur de traitement PDF:', error);
      this.validationErrors = ['Erreur lors du traitement du PDF: ' + (error as Error).message];
    } finally {
      this.isProcessing = false;
    }
  }

  exportToExcel() {
    if (this.transactions.length === 0) {
      console.warn('Aucune transaction à exporter');
      return;
    }

    try {
      // Create Excel template with extracted data
      this.excelTemplateService.createExcelTemplate(this.transactions);
      console.log('Template Excel créé avec succès');
    } catch (error) {
      console.error('Erreur lors de la création du template Excel:', error);
    }
  }

  exportToExcelLegacy() {
    // Keep the original export functionality as backup
    const syntheseMap = new Map<string, number>();
    this.transactions.forEach((t) => {
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
      XLSX.utils.json_to_sheet(this.transactions),
      'Détails'
    );
    XLSX.writeFile(wb, 'ventilation_2024_legacy.xlsx');
  }

  async onTemplateFileSelected(event: any) {
    const file = event.target.files[0];
    if (!file || this.transactions.length === 0) {
      console.warn('Veuillez d\'abord traiter un PDF et sélectionner un template Excel');
      return;
    }

    this.isProcessing = true;

    try {
      await this.excelTemplateService.updateExcelTemplate(file, this.transactions);
      console.log('Template Excel mis à jour avec succès');
    } catch (error) {
      console.error('Erreur lors de la mise à jour du template:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  clearData() {
    this.transactions = [];
    this.validationErrors = [];
  }

  getSummaryByDesignation() {
    const summaryMap = new Map<string, { count: number; total: number }>();
    
    this.transactions.forEach(t => {
      const existing = summaryMap.get(t.designation) || { count: 0, total: 0 };
      summaryMap.set(t.designation, {
        count: existing.count + 1,
        total: existing.total + Math.abs(t.montant)
      });
    });

    return Array.from(summaryMap.entries()).map(([designation, data]) => ({
      designation,
      count: data.count,
      total: data.total
    }));
  }
}