import {isCard,cardAmounts,expectedSettlement} from './card-settlement-core.js';
export function cardReportDetails(method, amount, paidAt) {
  if(!isCard(method))return '';
  const {feeCents,netCents}=cardAmounts(amount);
  const money=c=>(c/100).toLocaleString('es-MX',{style:'currency',currency:'MXN'});
  const date=new Date(paidAt);
  const settlement=Number.isFinite(date.getTime())?expectedSettlement(date):null;
  const day=settlement?new Date(settlement.expectedAt).toLocaleDateString('es-MX',{timeZone:'America/Mexico_City',day:'numeric',month:'short'}):null;
  return `<small class="payment-card-detail">Comisión 5%: −${money(feeCents)}</small><small class="payment-card-detail payment-card-net">Neto: ${money(netCents)}</small>${day?`<small class="payment-card-detail">Depósito previsto: ${day}, 12:00</small>`:''}`;
}
if(typeof window!=='undefined')window.cardReportDetails=cardReportDetails;
