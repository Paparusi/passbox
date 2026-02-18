import chalk from 'chalk';
import Table from 'cli-table3';

export type OutputFormat = 'plain' | 'json' | 'table';

export function formatOutput(data: unknown, format: OutputFormat = 'plain'): string {
  if (format === 'json') {
    return JSON.stringify(data, null, 2);
  }
  if (typeof data === 'string') {
    return data;
  }
  return JSON.stringify(data, null, 2);
}

export function printTable(headers: string[], rows: string[][]) {
  const table = new Table({
    head: headers.map(h => chalk.cyan(h)),
    style: { head: [], border: [] },
  });
  rows.forEach(row => table.push(row));
  console.log(table.toString());
}

export function printSuccess(message: string) {
  console.log(chalk.green('OK') + ' ' + message);
}

export function printError(message: string) {
  console.error(chalk.red('Error:') + ' ' + message);
}

export function printWarning(message: string) {
  console.log(chalk.yellow('Warning:') + ' ' + message);
}
