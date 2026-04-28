const fs = require('fs');
const path = require('path');

const cssPath = path.join(__dirname, 'src', 'pages', 'billing_officer', 'MeterReading.css');

const appendCss = `
/* ─── Multi Zone Selection ─────────────────────────────────────────── */
.zone-selection-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 20px;
}

.zone-pill {
  padding: 8px 16px;
  background: #f1f5f9;
  color: #64748b;
  border-radius: 20px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  border: 2px solid transparent;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  user-select: none;
}

.zone-pill:hover {
  background: #e2e8f0;
  color: #334155;
  transform: translateY(-1px);
}

.zone-pill.active {
  background: #eff6ff;
  color: #2563eb;
  border-color: #3b82f6;
  box-shadow: 0 4px 12px rgba(37, 99, 235, 0.15);
}

.existing-schedule {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  padding: 16px;
}
`;

fs.appendFileSync(cssPath, appendCss);
console.log('Appended CSS.');
