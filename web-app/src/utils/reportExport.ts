type ReportColumn<T> = {
  key: keyof T | string;
  label: string;
  value?: (row: T) => string | number | null | undefined;
};

const formatCsvValue = (value: unknown) => {
  const normalized = value === null || value === undefined ? '' : String(value);
  return `"${normalized.replace(/"/g, '""')}"`;
};

const safeFilePart = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'report';

export const downloadCsvReport = <T extends Record<string, any>>(
  title: string,
  rows: T[],
  columns: ReportColumn<T>[],
  options: {
    filename?: string;
    generatedAt?: Date;
    filters?: Record<string, string | number | null | undefined>;
    summary?: Record<string, string | number | null | undefined>;
  } = {}
) => {
  const generatedAt = options.generatedAt || new Date();
  const reportRows: string[] = [
    [title].map(formatCsvValue).join(','),
    ['Generated At', generatedAt.toLocaleString('en-PH')].map(formatCsvValue).join(','),
  ];

  Object.entries(options.filters || {}).forEach(([label, value]) => {
    if (value !== null && value !== undefined && String(value).trim()) {
      reportRows.push([label, value].map(formatCsvValue).join(','));
    }
  });

  Object.entries(options.summary || {}).forEach(([label, value]) => {
    reportRows.push([label, value ?? ''].map(formatCsvValue).join(','));
  });

  reportRows.push('');
  reportRows.push(columns.map((column) => formatCsvValue(column.label)).join(','));

  rows.forEach((row) => {
    reportRows.push(
      columns
        .map((column) => {
          const value = column.value ? column.value(row) : row[column.key as keyof T];
          return formatCsvValue(value);
        })
        .join(',')
    );
  });

  const csvContent = `\uFEFF${reportRows.join('\r\n')}`;
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const datePart = generatedAt.toISOString().slice(0, 10);
  link.href = url;
  link.download = options.filename || `${safeFilePart(title)}-${datePart}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};
