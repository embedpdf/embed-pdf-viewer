export const formatDate = (dateValue?: string | Date) => {
  if (!dateValue) return '(no date)';
  try {
    const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return typeof dateValue === 'string' ? dateValue : '(no date)';
  }
};
