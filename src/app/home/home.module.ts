import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { FormsModule } from '@angular/forms';
import { HomePage } from './home.page';
import { CurrencyModalComponent } from '../components/currency-modal/currency-modal.component';
import { TransactionQuickviewComponent } from '../components/transaction-quickview/transaction-quickview.component';

import { HomePageRoutingModule } from './home-routing.module';


@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    HomePageRoutingModule
  ],
  declarations: [HomePage, CurrencyModalComponent, TransactionQuickviewComponent]
})
export class HomePageModule {}