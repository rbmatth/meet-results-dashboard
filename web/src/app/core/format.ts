import { Pipe, PipeTransform } from '@angular/core';

// Centiseconds -> swim time string. 3247 -> "32.47", 13958 -> "2:19.58".
export function formatCs(cs: number | null | undefined): string {
  if (cs == null) return '';
  const min = Math.floor(cs / 6000);
  const sec = Math.floor((cs % 6000) / 100);
  const hund = cs % 100;
  const ss = min > 0 ? String(sec).padStart(2, '0') : String(sec);
  return (min > 0 ? `${min}:` : '') + ss + '.' + String(hund).padStart(2, '0');
}

// Signed time delta in seconds. Positive drop shows as "-1.23" (faster = negative sign).
export function formatDropCs(dropCs: number | null | undefined): string {
  if (dropCs == null) return '';
  const sign = dropCs > 0 ? '-' : dropCs < 0 ? '+' : '';
  return sign + (Math.abs(dropCs) / 100).toFixed(2);
}

@Pipe({ name: 'time', standalone: true })
export class TimePipe implements PipeTransform {
  transform(cs: number | null | undefined): string {
    return formatCs(cs);
  }
}

@Pipe({ name: 'drop', standalone: true })
export class DropPipe implements PipeTransform {
  transform(cs: number | null | undefined): string {
    return formatDropCs(cs);
  }
}
