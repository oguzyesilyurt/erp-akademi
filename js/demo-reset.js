// Merkezi demo sıfırlama: tüm modüllerin işlem verisini tutarlı biçimde başlangıca döndürür.
// Modüllerdeki "Demo verisini sıfırla" düğmeleri ve Ayarlar sayfası bu işlevi çağırır.
import { resetMasterData } from './company.js';
import { resetErp } from './erp.js';
import { resetFixes } from './release.js';
import { resetIam } from './auth.js';
import { resetQuoteDraft } from './sim-quote.js';

// İşlem verisi: belgeler, stok ve bakiye etkileri, onaylar, CRM/MM/FI kayıtları, test koşumları ve defect'ler
export const TX_KEYS = [
  'erp-akademi:quotes',
  'erp-akademi:quote-seq',
  'erp-akademi:erp',
  'erp-akademi:mm',
  'erp-akademi:c4c',
  'erp-akademi:fi',
  'erp-akademi:testlab',
  'erp-akademi:masterdata',
];
// Öğrenme ilerlemesi ve sonuçlar
export const LEARNING_KEYS = ['erp-akademi:progress', 'erp-akademi:results', 'erp-akademi:docs-read', 'erp-akademi:last'];

const drop = (keys) =>
  keys.forEach((k) => {
    try {
      localStorage.removeItem(k);
    } catch {}
  });

// opts.transactions: işlem verisi (varsayılan), opts.iam: kullanıcı/rol ayarları, opts.learning: ilerleme
export function resetAllDemo({ transactions = true, iam = false, learning = false } = {}) {
  if (transactions) {
    drop(TX_KEYS);
    resetQuoteDraft();
    resetFixes(); // v1.1 düzeltmeleri defect'lerle birlikte geri alınır
    resetMasterData(); // stok, açık bakiye, CRM aday hesapları ve ana veri değişiklikleri
    resetErp(); // bekleyen aktarım zamanlayıcıları da durur
  }
  if (iam) resetIam();
  if (learning) drop(LEARNING_KEYS);
  document.dispatchEvent(new CustomEvent('erp:refresh'));
  if (learning) document.dispatchEvent(new CustomEvent('erp:progress'));
}
