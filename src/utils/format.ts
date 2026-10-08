const vnd = new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
  maximumFractionDigits: 0,
});

/** Prices are stored as integer VND. */
export const formatVnd = (amount: number) => vnd.format(amount);
