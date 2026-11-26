/**
 * FinScope Data Ingestion Modal (`src/finscope/views/ingest-modal.ts`)
 *
 * Preserves full Excel (.xlsx), CSV, JSON, PDF, Google Drive folder / Google Sheets
 * ingestion + Tier 2 Gemini Enrichment + Tier 3 Managed Agent Audit + Sample Ledgers.
 */

import type { DatasetBundle, IngestProgressStep, RawIngestFile } from '../../../contracts/index.js';
import nimbusSaasCsv from '../../../data/sample_b2b/nimbus_cloud_saas_fy2025.csv?raw';
import { fetchGoogleDriveInput, processByoIngestion, readBrowserFiles } from '../../ingest/index.js';

export interface IngestModalController {
  open: () => void;
  close: () => void;
}

export function createIngestModal(
  parentEl: HTMLElement,
  options: {
    onDatasetLoaded: (bundle: DatasetBundle) => void;
    onResetSamplePersonal: () => void;
  }
): IngestModalController {
  const backdrop = document.createElement('div');
  backdrop.className = 'fs-modal-backdrop';
  backdrop.dataset.testid = 'ingest-modal';
  backdrop.style.display = 'none';

  backdrop.innerHTML = `
    <div class="fs-modal-dialog" role="dialog" aria-modal="true" aria-labelledby="fs-ingest-title">
      <div class="fs-modal-header">
        <div>
          <h2 id="fs-ingest-title" class="fs-card-title">Import Financial Ledger</h2>
          <p class="fs-card-meta">Load Excel (.xlsx), CSV, JSON, PDF, or a public Google Drive / Sheets URL</p>
        </div>
        <button type="button" class="fs-icon-btn" id="fs-ingest-close" aria-label="Close import modal">×</button>
      </div>

      <div class="fs-modal-body">
        <div class="fs-dropzone" id="fs-dropzone" tabindex="0" role="button" data-testid="ingest-dropzone">
          <div class="fs-dropzone-title">Drop Excel (.xlsx), CSV, JSON, or PDF files here</div>
          <div class="fs-dropzone-sub">or click to browse local files</div>
        </div>
        <input type="file" id="fs-file-input" multiple accept=".xlsx,.xls,.csv,.tsv,.json,.txt,.pdf" style="display:none" />

        <div class="fs-drive-row">
          <input type="text" id="fs-drive-url" class="fs-input" placeholder="Paste Google Drive folder or Google Sheets URL…" />
          <button type="button" id="fs-drive-btn" class="fs-btn fs-btn-primary">Import Drive</button>
        </div>

        <label class="fs-deep-toggle">
          <input type="checkbox" id="fs-deep-agent-check" />
          <span>Enable Deep Agent Audit (Python Sandbox · multi-table reconciliation)</span>
        </label>

        <div class="fs-progress-wrap" id="fs-ingest-progress" style="display:none">
          <div class="fs-progress-top">
            <span id="fs-ingest-progress-label">Processing…</span>
            <span id="fs-ingest-progress-pct" class="tabular-nums">0%</span>
          </div>
          <div class="fs-progress-bar"><div id="fs-ingest-progress-fill" style="width:0%"></div></div>
          <button type="button" id="fs-skip-agent" class="fs-link-btn" style="display:none;margin-top:8px;">Skip wait &amp; load fast summary →</button>
        </div>

        <div id="fs-ingest-error" class="fs-error-box" style="display:none"></div>

        <div class="fs-sample-section">
          <div class="fs-kpi-label" style="margin-bottom:8px;">Quick-Load Verified Sample Ledgers</div>
          <div class="fs-sample-grid">
            <button type="button" class="fs-sample-btn" id="fs-load-sam-btn">
              <strong>Sam · 2025 Personal Archive</strong>
              <span>1,000 transactions · Card &amp; Savings</span>
            </button>
            <button type="button" class="fs-sample-btn" id="fs-load-nimbus-btn" data-testid="load-nimbus-sample-btn">
              <strong>Nimbus Cloud SaaS FY2025</strong>
              <span>505 B2B ledger lines · ARR &amp; OpEx</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  `;

  parentEl.appendChild(backdrop);

  const dropzone = backdrop.querySelector<HTMLElement>('#fs-dropzone')!;
  const fileInput = backdrop.querySelector<HTMLInputElement>('#fs-file-input')!;
  const driveUrl = backdrop.querySelector<HTMLInputElement>('#fs-drive-url')!;
  const driveBtn = backdrop.querySelector<HTMLButtonElement>('#fs-drive-btn')!;
  const deepCheck = backdrop.querySelector<HTMLInputElement>('#fs-deep-agent-check')!;
  const progWrap = backdrop.querySelector<HTMLElement>('#fs-ingest-progress')!;
  const progLabel = backdrop.querySelector<HTMLElement>('#fs-ingest-progress-label')!;
  const progPct = backdrop.querySelector<HTMLElement>('#fs-ingest-progress-pct')!;
  const progFill = backdrop.querySelector<HTMLElement>('#fs-ingest-progress-fill')!;
  const skipBtn = backdrop.querySelector<HTMLButtonElement>('#fs-skip-agent')!;
  const errBox = backdrop.querySelector<HTMLElement>('#fs-ingest-error')!;

  let busy = false;
  let abortCtrl: AbortController | null = null;

  const showError = (msg: string | null): void => {
    if (!msg) {
      errBox.style.display = 'none';
      errBox.textContent = '';
      return;
    }
    errBox.style.display = 'block';
    errBox.textContent = msg;
  };

  const updateProgress = (step: IngestProgressStep | null): void => {
    if (!step) {
      progWrap.style.display = 'none';
      return;
    }
    progWrap.style.display = 'block';
    progLabel.textContent = step.label;
    const pct = Math.max(0, Math.min(100, Math.round(step.progress_pct)));
    progPct.textContent = `${pct}%`;
    progFill.style.width = `${pct}%`;
    skipBtn.style.display = deepCheck.checked ? 'inline-flex' : 'none';
  };

  const close = (): void => {
    backdrop.style.display = 'none';
  };

  const open = (): void => {
    showError(null);
    updateProgress(null);
    backdrop.style.display = 'flex';
  };

  const runFiles = async (files: RawIngestFile[]): Promise<void> => {
    if (busy) return;
    busy = true;
    showError(null);
    abortCtrl = deepCheck.checked ? new AbortController() : null;
    try {
      const bundle = await processByoIngestion({
        files,
        deepAgentAudit: deepCheck.checked,
        abortSignal: abortCtrl?.signal,
        onProgress: (step) => updateProgress(step),
      });
      options.onDatasetLoaded(bundle);
      close();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to process dataset.');
      updateProgress(null);
    } finally {
      busy = false;
      abortCtrl = null;
    }
  };

  backdrop.querySelector('#fs-ingest-close')?.addEventListener('click', close);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });
  skipBtn.addEventListener('click', () => abortCtrl?.abort());

  dropzone.addEventListener('click', () => fileInput.click());
  dropzone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fileInput.click();
    }
  });
  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('is-dragover');
  });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('is-dragover'));
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('is-dragover');
    if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
      void (async () => {
        const raw = await readBrowserFiles(e.dataTransfer!.files);
        await runFiles(raw);
      })();
    }
  });

  fileInput.addEventListener('change', () => {
    if (fileInput.files && fileInput.files.length > 0) {
      void (async () => {
        const raw = await readBrowserFiles(fileInput.files!);
        await runFiles(raw);
      })();
    }
  });

  driveBtn.addEventListener('click', () => {
    const url = driveUrl.value.trim();
    if (!url) {
      showError('Paste a public Google Drive folder or Google Sheets URL first.');
      driveUrl.focus();
      return;
    }
    if (busy) return;
    busy = true;
    showError(null);
    void (async () => {
      try {
        const files = await fetchGoogleDriveInput(url, undefined, (s) => updateProgress(s));
        busy = false;
        await runFiles(files);
      } catch (err) {
        showError(err instanceof Error ? err.message : 'Google Drive import failed.');
        updateProgress(null);
        busy = false;
      }
    })();
  });

  backdrop.querySelector('#fs-load-sam-btn')?.addEventListener('click', () => {
    options.onResetSamplePersonal();
    close();
  });

  backdrop.querySelector('#fs-load-nimbus-btn')?.addEventListener('click', () => {
    const sampleFile: RawIngestFile = {
      name: 'nimbus_cloud_saas_fy2025.csv',
      mimeType: 'text/csv',
      content: nimbusSaasCsv,
      encoding: 'utf8',
    };
    void runFiles([sampleFile]);
  });

  return { open, close };
}
