import { Component, Input } from '@angular/core';
import { ModalController } from '@ionic/angular';
import { TransactionData } from '../../services/excel-template.service';

@Component({
  selector: 'app-transaction-quickview',
  templateUrl: './transaction-quickview.component.html',
  styleUrls: ['./transaction-quickview.component.scss'],
  standalone: false,
})
export class TransactionQuickviewComponent {
  @Input() transactions: TransactionData[] = [];
  @Input() usdAmounts: TransactionData[] = [];
  @Input() exchangeRate: number = 2800;
  @Input() designation: string = '';
  @Input() totalAmount: number = 0;
  @Input() totalUsdAmount: number = 0;

  constructor(private modalController: ModalController) {}

  dismiss() {
    this.modalController.dismiss();
  }

  getOriginalUsdAmount(index: number): TransactionData | null {
    return this.usdAmounts[index] || null;
  }

  isSuspiciousAmount(amount: number): boolean {
    return Math.abs(amount) > 1000000; // Amounts over 1M CDF are suspicious
  }

  formatCurrency(amount: number, currency: string = 'CDF'): string {
    return `${amount.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
  }
}