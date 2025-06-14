import { Component, Input, Output, EventEmitter } from '@angular/core';
import { ModalController } from '@ionic/angular';

@Component({
  selector: 'app-currency-modal',
  templateUrl: './currency-modal.component.html',
  styleUrls: ['./currency-modal.component.scss'],
  standalone: false,
})
export class CurrencyModalComponent {
  @Input() currentRate: number = 2800;
  @Output() rateConfirmed = new EventEmitter<{rate: number, dontAskAgain: boolean}>();

  exchangeRate: number = 2800;
  dontAskAgain: boolean = false;
  isValid: boolean = true;

  constructor(private modalController: ModalController) {}

  ngOnInit() {
    this.exchangeRate = this.currentRate;
  }

  validateRate() {
    this.isValid = this.exchangeRate > 0 && this.exchangeRate <= 10000;
  }

  confirm() {
    if (this.isValid && this.exchangeRate > 0) {
      this.rateConfirmed.emit({
        rate: this.exchangeRate,
        dontAskAgain: this.dontAskAgain
      });
      this.modalController.dismiss({
        rate: this.exchangeRate,
        dontAskAgain: this.dontAskAgain
      });
    }
  }

  cancel() {
    this.modalController.dismiss();
  }

  // Preset common rates for quick selection
  setPresetRate(rate: number) {
    this.exchangeRate = rate;
    this.validateRate();
  }

  // Format number with English syntax
  formatNumber(value: number, decimals: number = 2): string {
    return value.toLocaleString('en-US', { 
      minimumFractionDigits: decimals, 
      maximumFractionDigits: decimals 
    });
  }
}