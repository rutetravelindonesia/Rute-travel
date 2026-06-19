export const PLATFORM_FEE_RATE = 0.10;

export function toPassengerPrice(nett: number): number {
  return Math.round(nett * (1 + PLATFORM_FEE_RATE));
}

export function toNettPrice(passengerPrice: number): number {
  return Math.round(passengerPrice / (1 + PLATFORM_FEE_RATE));
}

export function platformFeeAmount(passengerPrice: number): number {
  return passengerPrice - toNettPrice(passengerPrice);
}
