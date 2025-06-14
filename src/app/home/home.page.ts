import { Component } from '@angular/core';

import * as XLSX from 'xlsx';
// Importation optimisée de PDF.js
import * as pdfjsLib from 'pdfjs-dist';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';

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
  transactions: any[] = [];

  /*
  async onFileSelected(event: any) {
    const file = event.target.files[0];
    if (!file) return;

    try {
      console.log(file);
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await getDocument({ data: arrayBuffer }).promise;

      const result: any[] = [];

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const strings = content.items.map((item: any) => item.str);
        const lines = strings.join('\n').split(/\n+/);

        lines.forEach((line) => {
          // Correction de la regex (supprimez les doubles backslashes)
          const match = line.match(
            /(\d{2}-\d{2}-\d{4}).+?(PMT TOURISME|FPT INVESTISSEMENT|ONT FICHE STATISTIQUES|APPUI ADM DU TOURISME|ICCN|SITE TOURISTIQUE|COMITE DE SUIVI ET VALIDATION|ONT CONTROLE ET INSPECTION DES UNITES TOURISTIQUES).*?(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2}))/
          );

          if (match) {
            result.push({
              date: match[1],
              designation: match[2],
              montant: parseFloat(match[3].replace(/,/g, '').replace(/ /g, '')),
            });
          }
        });
      }
      console.log(result);
      this.transactions = result;
    } catch (error) {
      console.error('Error processing PDF:', error);
    }
  }
  */

  async onFileSelected(event: any) {
    const file = event.target.files[0];
    if (!file) return;

    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await getDocument({ data: arrayBuffer }).promise;
      const result: any[] = [];

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

      console.log('Transactions filtrées:', result);
      this.transactions = result;
    } catch (error) {
      console.error('Erreur de traitement PDF:', error);
    }
  }

  exportToExcel() {
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
    XLSX.writeFile(wb, 'ventilation_2024.xlsx');
  }
}
