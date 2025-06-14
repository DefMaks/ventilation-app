import { Injectable } from '@angular/core';

export interface CurrencyRate {
  rate: number;
  date: string;
  dontAskAgain: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class CurrencyService {
  private readonly STORAGE_KEY = 'usd_cdf_rate';

  constructor() { }

  /**
   * Get stored USD to CDF rate from localStorage
   */
  getStoredRate(): CurrencyRate | null {
    const stored = localStorage.getItem(this.STORAGE_KEY);
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch (error) {
        console.error('Error parsing stored currency rate:', error);
        return null;
      }
    }
    return null;
  }

  /**
   * Save USD to CDF rate to localStorage
   */
  saveRate(rate: number, dontAskAgain: boolean = false): void {
    const currencyRate: CurrencyRate = {
      rate: rate,
      date: new Date().toISOString(),
      dontAskAgain: dontAskAgain
    };
    
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(currencyRate));
  }

  /**
   * Convert USD amount to CDF
   */
  convertUsdToCdf(usdAmount: number, rate: number): number {
    return usdAmount * rate;
  }

  /**
   * Check if we should ask for rate (not stored or user didn't check "don't ask again")
   */
  shouldAskForRate(): boolean {
    const stored = this.getStoredRate();
    return !stored || !stored.dontAskAgain;
  }

  /**
   * Get current rate or default
   */
  getCurrentRate(): number {
    const stored = this.getStoredRate();
    return stored ? stored.rate : 2800; // Default rate as fallback
  }

  /**
   * Clear stored rate (for testing or reset purposes)
   */
  clearStoredRate(): void {
    localStorage.removeItem(this.STORAGE_KEY);
  }
}