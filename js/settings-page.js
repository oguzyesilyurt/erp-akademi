// Ayarlar (#/settings): merkezi demo sıfırlama ve tercihler
import { icon } from './icons.js';
import { esc, toast } from './ui.js';
import { loadRoles, isIamCustomized, can } from './auth.js';
import { loadCompany } from './company.js';
import { resetAllDemo, TX_KEYS } from './demo-reset.js';

const LABELS = {
  'erp-akademi:quotes': 'Teklifler ve onay geçmişi',
  'erp-akademi:erp': 'Satış siparişleri, aktarım mesajları, teslimatlar, satış faturaları',
  'erp-akademi:mm': 'Satın alma talepleri, siparişler, mal girişleri, tedarikçi faturaları, transferler',
  'erp-akademi:c4c': 'Lead, fırsat, aktivite ve kampanyalar',
  'erp-akademi:fi': 'Tahsilatlar ve ödeme programı çalıştırmaları',
  'erp-akademi:testlab': "Test case'ler, koşumlar ve defect'ler",
  'erp-akademi:masterdata': 'Stok ve açık bakiye değişiklikleri, CRM aday hesapları, ana veri düzenlemeleri',
};

function stored(key) {
  try {
    const v = localStorage.getItem(key);
    return v && v !== '[]' && v !== '{}' ? v.length : 0;
  } catch {
    return 0;
  }
}

export async function viewSettings(setView) {
  await Promise.all([loadRoles(), loadCompany()]);
  const used = TX_KEYS.filter((k) => LABELS[k] && stored(k));
  setView(
    `<div data-settings>
      <header class="page-head"><div>
        <p class="eyebrow">Uygulama</p>
        <h1>Ayarlar</h1>
        <p class="lead">Tüm veriler bu tarayıcıda saklanır. Bir alıştırmayı baştan yapmak için demo verisini tek yerden, tutarlı biçimde sıfırla.</p>
      </div></header>
      <section class="card settings-card">
        <h2>${icon('close')} Demo verisini sıfırla</h2>
        <p class="cell-sub">Modüllerdeki "Demo verisini sıfırla" düğmeleri de bu işlemi çağırır: belgeler arası bağlar (teklif → sipariş → fatura → muhasebe, talep → sipariş → mal girişi → ödeme) yarım kalmasın diye tüm modüller birlikte başlangıca döner.</p>
        <fieldset class="settings-opts">
          <label class="role-opt"><input type="checkbox" data-opt="transactions" checked><span><strong>İşlem verisi</strong><span class="cell-sub">Belgeler, stok ve bakiye etkileri, onaylar, defect'ler ve v1.1 düzeltmeleri.</span></span></label>
          <label class="role-opt"><input type="checkbox" data-opt="iam"><span><strong>Kullanıcı ve rol ayarları</strong><span class="cell-sub">${isIamCustomized() ? 'Oluşturduğun kullanıcılar, rol ve departman değişiklikleri silinir; varsayılan 5 kullanıcıya dönülür.' : 'Şu an varsayılan durumda.'}${can('USER_ADMIN') ? '' : ' (Sıfırlama yetki gerektirmez; eğitim ortamı.)'}</span></span></label>
          <label class="role-opt"><input type="checkbox" data-opt="learning"><span><strong>Öğrenme ilerlemesi</strong><span class="cell-sub">Tamamlanan bölümler, Hata Avı ve quiz sonuçları, okunan makaleler.</span></span></label>
        </fieldset>
        ${used.length ? `<details class="settings-detail"><summary>Şu an kayıtlı işlem verisi (${used.length} alan)</summary><ul class="bullets">${used.map((k) => `<li>${esc(LABELS[k])}</li>`).join('')}</ul></details>` : '<p class="cell-sub">Kayıtlı işlem verisi yok; tüm modüller başlangıç durumunda.</p>'}
        <div class="drawer-actions"><button class="btn btn-primary danger-btn" type="button" data-reset-all>${icon('close')}<span>Seçilenleri sıfırla</span></button></div>
      </section>
    </div>`,
    'Ayarlar'
  );
  const root = document.querySelector('[data-settings]');
  root?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-reset-all]');
    if (!b) return;
    const opt = (k) => root.querySelector(`[data-opt="${k}"]`).checked;
    const o = { transactions: opt('transactions'), iam: opt('iam'), learning: opt('learning') };
    if (!o.transactions && !o.iam && !o.learning) return toast('Sıfırlanacak bir seçenek işaretle');
    if (!b.classList.contains('confirm')) {
      b.classList.add('confirm');
      b.querySelector('span').textContent = 'Emin misin? Tekrar dokun';
      return;
    }
    resetAllDemo(o);
    toast(`Sıfırlandı: ${[o.transactions && 'işlem verisi', o.iam && 'kullanıcı/roller', o.learning && 'ilerleme'].filter(Boolean).join(', ')}`);
  });
}
