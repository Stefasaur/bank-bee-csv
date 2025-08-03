import Chart from 'chart.js/auto';
import * as XLSX from 'xlsx';

import bankBeeLogo from './assets/images/Bank-Bee.png';
import ersteLogo from './assets/images/erste-bank-logo.jpg';
import nkbmOtpLogo from './assets/images/nkbm-otp-logo.webp';
import nlbLogo from './assets/images/nlb-bank.webp';
import intesaLogo from './assets/images/sanpaolo.jpg';

interface ParsedData {
  sheetName: string;
  headers: string[];
  rows: any[][];
}

interface Transaction {
  date: Date;
  amount: number;
  description: string;
  recipient: string;
  type: 'income'|'expense';
}

interface MonthlySpending {
  [category: string]: number;
}

interface CategoryData {
  [category: string]: {
    amount: number;
    transactions: Transaction[];
  };
}

interface RecipientData {
  name: string;
  amount: number;
  count: number;
}

interface DailyData {
  date: string;
  amount: number;
  count: number;
  transactions: Transaction[];
}

interface BankConfig {
  name: string;
  logo: string;
  dateColumn: string;
  incomeColumn: string;
  expenseColumn: string;
  descriptionColumn: string;
  recipientColumn: string;
  dateFormat: string;
  currency: string;
}

const bankConfigs: {[key: string]: BankConfig} = {
  'nkbm-otp': {
    name: 'NKBM/OTP',
    logo: nkbmOtpLogo,
    dateColumn: 'DATUM VALUTE',
    incomeColumn: 'DOBRO',
    expenseColumn: 'BREME',
    descriptionColumn: 'NAMEN',
    recipientColumn: 'UDELE.*NAZIV',
    dateFormat: 'dd.mm.yyyy',
    currency: '€'
  },
  'nlb': {
    name: 'NLB',
    logo: nlbLogo,
    dateColumn: 'Datum',
    incomeColumn: 'Prilivi',
    expenseColumn: 'Odlivi',
    descriptionColumn: 'Namen',
    recipientColumn: 'Prejemnik',
    dateFormat: 'dd.mm.yyyy',
    currency: '€'
  },
  'intesa': {
    name: 'Intesa Sanpaolo',
    logo: intesaLogo,
    dateColumn: 'Data',
    incomeColumn: 'Accrediti',
    expenseColumn: 'Addebiti',
    descriptionColumn: 'Descrizione',
    recipientColumn: 'Beneficiario',
    dateFormat: 'dd/mm/yyyy',
    currency: '€'
  },
  'erste': {
    name: 'Erste Bank',
    logo: ersteLogo,
    dateColumn: 'Datum valute',
    incomeColumn: 'Iznos',
    expenseColumn: 'Iznos',
    descriptionColumn: 'Opis',
    recipientColumn: 'Opis',
    dateFormat: 'dd.mm.yyyy',
    currency: 'RSD'
  }
};

class ExcelParser {
  private getCurrency(): string {
    const config = bankConfigs[this.currentBank];
    return config ? config.currency : '€';
  }
  private fileInput: HTMLInputElement;
  private uploadArea: HTMLElement;
  private tableContainer: HTMLElement;
  private tableHead: HTMLElement;
  private tableBody: HTMLElement;
  private fileInfo: HTMLElement;
  private errorMessage: HTMLElement;
  private sheetTabs: HTMLElement;
  private chartsContainer: HTMLElement;
  private monthSelect: HTMLSelectElement;
  private bankSelect: HTMLSelectElement;
  private bankLogo: HTMLImageElement;
  private parsedSheets: ParsedData[] = [];
  private currentSheetIndex: number = 0;
  private transactions: Transaction[] = [];
  private expenseChart: Chart|null = null;
  private incomeChart: Chart|null = null;
  private currentBank: string = 'nkbm-otp';
  private currentView: 'category'|'recipient' = 'category';
  private currentChartType: 'pie'|'daily' = 'pie';
  private currentExpenseData: CategoryData = {};
  private currentIncomeData: CategoryData = {};
  private currentExpenseDailyData: DailyData[] = [];
  private currentIncomeDailyData: DailyData[] = [];
  private categoryViewBtn: HTMLButtonElement;
  private recipientViewBtn: HTMLButtonElement;
  private pieChartBtn: HTMLButtonElement;
  private dailyChartBtn: HTMLButtonElement;
  private mainLogo: HTMLImageElement;
  private uploadText: HTMLElement;
  private uploadSubtext: HTMLElement;

  constructor() {
    this.fileInput = document.getElementById('fileInput') as HTMLInputElement;
    this.uploadArea = document.getElementById('uploadArea') as HTMLElement;
    this.tableContainer =
        document.getElementById('tableContainer') as HTMLElement;
    this.tableHead = document.getElementById('tableHead') as HTMLElement;
    this.tableBody = document.getElementById('tableBody') as HTMLElement;
    this.fileInfo = document.getElementById('fileInfo') as HTMLElement;
    this.errorMessage = document.getElementById('errorMessage') as HTMLElement;
    this.sheetTabs = document.getElementById('sheetTabs') as HTMLElement;
    this.chartsContainer =
        document.getElementById('chartsContainer') as HTMLElement;
    this.monthSelect =
        document.getElementById('monthSelect') as HTMLSelectElement;
    this.bankSelect =
        document.getElementById('bankSelect') as HTMLSelectElement;
    this.bankLogo = document.getElementById('bankLogo') as HTMLImageElement;
    this.categoryViewBtn =
        document.getElementById('categoryView') as HTMLButtonElement;
    this.recipientViewBtn =
        document.getElementById('recipientView') as HTMLButtonElement;
    this.pieChartBtn = document.getElementById('pieChart') as HTMLButtonElement;
    this.dailyChartBtn =
        document.getElementById('dailyChart') as HTMLButtonElement;
    this.mainLogo = document.getElementById('mainLogo') as HTMLImageElement;
    this.uploadText = document.getElementById('uploadText') as HTMLElement;
    this.uploadSubtext =
        document.getElementById('uploadSubtext') as HTMLElement;

    this.initializeEventListeners();
    this.updateBankLogo();
    this.setMainLogo();
  }

  private initializeEventListeners(): void {
    this.uploadArea.addEventListener('click', () => this.fileInput.click());
    this.fileInput.addEventListener('change', (e) => this.handleFileSelect(e));
    this.monthSelect.addEventListener('change', () => this.updateCharts());
    this.bankSelect.addEventListener('change', (e) => this.handleBankChange(e));
    this.categoryViewBtn.addEventListener(
        'click', () => this.switchChartView('category'));
    this.recipientViewBtn.addEventListener(
        'click', () => this.switchChartView('recipient'));
    this.pieChartBtn.addEventListener(
        'click', () => this.switchChartType('pie'));
    this.dailyChartBtn.addEventListener(
        'click', () => this.switchChartType('daily'));

    this.uploadArea.addEventListener('dragover', (e) => {
      e.preventDefault();
      this.uploadArea.classList.add('dragover');
    });

    this.uploadArea.addEventListener('dragleave', () => {
      this.uploadArea.classList.remove('dragover');
    });

    this.uploadArea.addEventListener('drop', (e) => {
      e.preventDefault();
      this.uploadArea.classList.remove('dragover');
      const files = e.dataTransfer?.files;
      if (files && files.length > 0) {
        this.processFile(files[0]);
      }
    });
  }

  private handleFileSelect(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      this.processFile(file);
    }
  }

  private processFile(file: File): void {
    this.hideError();
    this.hideTable();
    this.hideCharts();
    this.parsedSheets = [];
    this.transactions = [];
    this.currentSheetIndex = 0;

    if (!this.isValidFileType(file)) {
      this.showError(`Please select a valid CSV file from ${
          bankConfigs[this.currentBank].name} bank statements`);
      return;
    }

    this.showFileInfo(file);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, {
          type: 'binary',
          codepage: 1250  // Central European encoding for special characters
        });

        workbook.SheetNames.forEach(sheetName => {
          const worksheet = workbook.Sheets[sheetName];
          const jsonData =
              XLSX.utils.sheet_to_json(
                  worksheet, {header: 1, raw: false, dateNF: 'dd.mm.yyyy'}) as
              any[][];

          if (jsonData.length > 0) {
            let headers: string[];
            let rows: any[][];

            // Special handling for Erste Bank .xls format
            if (this.currentBank === 'erste') {
              // Find the header row (contains "Datum valute", "Iznos", etc.)
              let headerRowIndex = -1;
              for (let i = 0; i < jsonData.length; i++) {
                const row = jsonData[i];
                if (row && row.some(cell => 
                  cell && typeof cell === 'string' && 
                  (cell.includes('Datum valute') || cell.includes('Iznos')))) {
                  headerRowIndex = i;
                  break;
                }
              }
              
              if (headerRowIndex !== -1) {
                headers = jsonData[headerRowIndex].map(h => String(h || ''));
                rows = jsonData.slice(headerRowIndex + 1);
              } else {
                headers = jsonData[0].map(h => String(h || ''));
                rows = jsonData.slice(1);
              }
            } else {
              // Standard handling for CSV files
              headers = jsonData[0].map(h => String(h || ''));
              rows = jsonData.slice(1);
            }

            this.parsedSheets.push({sheetName, headers, rows});
          }
        });

        if (this.parsedSheets.length > 0) {
          this.createSheetTabs();
          this.displaySheet(0);

          // Check if this is a bank transaction file
          if (this.isBankTransactionFile()) {
            this.parseBankTransactions();
            this.setupMonthSelector();
            this.showCharts();
          }
        } else {
          this.showError('No data found in the file');
        }
      } catch (error) {
        this.showError('Error parsing file: ' + (error as Error).message);
      }
    };

    reader.onerror = () => {
      this.showError('Error reading file');
    };

    reader.readAsBinaryString(file);
  }

  private isBankTransactionFile(): boolean {
    if (this.parsedSheets.length === 0) return false;

    const headers = this.parsedSheets[0].headers;
    const config = bankConfigs[this.currentBank];

    // Check if key columns exist for the selected bank
    const hasDateColumn = headers.some(
        h => h && h.toUpperCase().includes(config.dateColumn.toUpperCase()));
    const hasIncomeColumn = headers.some(
        h => h && h.toUpperCase().includes(config.incomeColumn.toUpperCase()));
    const hasExpenseColumn = headers.some(
        h => h && h.toUpperCase().includes(config.expenseColumn.toUpperCase()));

    return hasDateColumn && (hasIncomeColumn || hasExpenseColumn);
  }

  private parseBankTransactions(): void {
    const sheet = this.parsedSheets[0];
    const headers = sheet.headers;
    const config = bankConfigs[this.currentBank];

    // Find column indices based on bank configuration
    const dateIndex = headers.findIndex(
        h => h && h.toUpperCase().includes(config.dateColumn.toUpperCase()));
    const incomeIndex = headers.findIndex(
        h => h && h.toUpperCase().includes(config.incomeColumn.toUpperCase()));
    const expenseIndex = headers.findIndex(
        h => h && h.toUpperCase().includes(config.expenseColumn.toUpperCase()));
    const purposeIndex = headers.findIndex(
        h => h && h.toUpperCase().includes(config.descriptionColumn.toUpperCase()));
    const recipientIndex = headers.findIndex(h => {
      if (!h) return false;
      const pattern = new RegExp(config.recipientColumn, 'i');
      return pattern.test(h);
    });

    // For Erste Bank, income and expense are the same column
    if (this.currentBank === 'erste') {
      if (dateIndex === -1 || incomeIndex === -1) {
        console.error('Required columns not found for Erste Bank. Date:', dateIndex, 'Amount:', incomeIndex);
        return;
      }
    } else {
      if (dateIndex === -1 || (incomeIndex === -1 && expenseIndex === -1)) {
        console.error('Required columns not found for bank:', this.currentBank);
        return;
      }
    }

    this.transactions = [];

    sheet.rows.forEach(row => {
      if (!row[dateIndex]) return;

      const dateStr = row[dateIndex];
      let date: Date;

      // Parse date based on bank's date format
      if (config.dateFormat === 'dd.mm.yyyy') {
        const dateParts = dateStr.split('.');
        date = new Date(
            parseInt(dateParts[2]), parseInt(dateParts[1]) - 1,
            parseInt(dateParts[0]));
      } else if (config.dateFormat === 'dd/mm/yyyy') {
        const dateParts = dateStr.split('/');
        date = new Date(
            parseInt(dateParts[2]), parseInt(dateParts[1]) - 1,
            parseInt(dateParts[0]));
      } else {
        date = new Date(dateStr);
      }

      const description = row[purposeIndex] || 'Unknown';
      const recipient = row[recipientIndex] || 'Unknown';

      // Special handling for Erste Bank (single amount column with +/- values)
      if (this.currentBank === 'erste' && incomeIndex !== -1) {
        const rawValue = String(row[incomeIndex]).trim();
        if (rawValue && rawValue !== '0' && rawValue !== '') {
          // Handle different number formats: 1,234.56 or 1.234,56
          let cleanValue = rawValue.replace(
              /[^\d,.-]/g,
              '');  // Remove non-numeric chars except comma, dot, minus

          // If contains both comma and dot, determine which is decimal separator
          if (cleanValue.includes(',') && cleanValue.includes('.')) {
            if (cleanValue.lastIndexOf(',') > cleanValue.lastIndexOf('.')) {
              // Comma is decimal separator (European format)
              cleanValue = cleanValue.replace(/\./g, '').replace(',', '.');
            } else {
              // Dot is decimal separator (US format)
              cleanValue = cleanValue.replace(/,/g, '');
            }
          } else if (cleanValue.includes(',')) {
            // Only comma - could be thousands or decimal separator
            const parts = cleanValue.split(',');
            if (parts.length === 2 && parts[1].length <= 2) {
              // Likely decimal separator
              cleanValue = cleanValue.replace(',', '.');
            } else {
              // Likely thousands separator
              cleanValue = cleanValue.replace(/,/g, '');
            }
          }

          const amount = parseFloat(cleanValue) || 0;
          if (amount !== 0) {
            const type = amount > 0 ? 'income' : 'expense';
            const absAmount = Math.abs(amount);
            console.log(`${type === 'income' ? 'Income' : 'Expense'}: ${rawValue} -> ${absAmount}`);
            this.transactions.push(
                {date, amount: absAmount, description, recipient, type});
          }
        }
      } else {
        // Standard handling for other banks with separate income/expense columns
        
        // Parse income if present
        if (incomeIndex !== -1 && row[incomeIndex]) {
          const rawValue = String(row[incomeIndex]).trim();
          if (rawValue && rawValue !== '0' && rawValue !== '') {
            // Handle different number formats: 1,234.56 or 1.234,56
            let cleanValue = rawValue.replace(
                /[^\d,.-]/g,
                '');  // Remove non-numeric chars except comma, dot, minus

            // If contains both comma and dot, determine which is decimal
            // separator
            if (cleanValue.includes(',') && cleanValue.includes('.')) {
              if (cleanValue.lastIndexOf(',') > cleanValue.lastIndexOf('.')) {
                // Comma is decimal separator (European format)
                cleanValue = cleanValue.replace(/\./g, '').replace(',', '.');
              } else {
                // Dot is decimal separator (US format)
                cleanValue = cleanValue.replace(/,/g, '');
              }
            } else if (cleanValue.includes(',')) {
              // Only comma - could be thousands or decimal separator
              const parts = cleanValue.split(',');
              if (parts.length === 2 && parts[1].length <= 2) {
                // Likely decimal separator
                cleanValue = cleanValue.replace(',', '.');
              } else {
                // Likely thousands separator
                cleanValue = cleanValue.replace(/,/g, '');
              }
            }

            const amount = parseFloat(cleanValue) || 0;
            if (amount > 0) {
              console.log(`Income: ${rawValue} -> ${amount}`);
              this.transactions.push(
                  {date, amount, description, recipient, type: 'income'});
            }
          }
        }

        // Parse expense if present
        if (expenseIndex !== -1 && row[expenseIndex]) {
          const rawValue = String(row[expenseIndex]).trim();
          if (rawValue && rawValue !== '0' && rawValue !== '') {
            // Handle different number formats: 1,234.56 or 1.234,56
            let cleanValue = rawValue.replace(
                /[^\d,.-]/g,
                '');  // Remove non-numeric chars except comma, dot, minus

            // If contains both comma and dot, determine which is decimal
            // separator
            if (cleanValue.includes(',') && cleanValue.includes('.')) {
              if (cleanValue.lastIndexOf(',') > cleanValue.lastIndexOf('.')) {
                // Comma is decimal separator (European format)
                cleanValue = cleanValue.replace(/\./g, '').replace(',', '.');
              } else {
                // Dot is decimal separator (US format)
                cleanValue = cleanValue.replace(/,/g, '');
              }
            } else if (cleanValue.includes(',')) {
              // Only comma - could be thousands or decimal separator
              const parts = cleanValue.split(',');
              if (parts.length === 2 && parts[1].length <= 2) {
                // Likely decimal separator
                cleanValue = cleanValue.replace(',', '.');
              } else {
                // Likely thousands separator
                cleanValue = cleanValue.replace(/,/g, '');
              }
            }

            const amount = parseFloat(cleanValue) || 0;
            if (amount > 0) {
              console.log(`Expense: ${rawValue} -> ${amount}`);
              this.transactions.push(
                  {date, amount, description, recipient, type: 'expense'});
            }
          }
        }
      }
    });
  }

  private setupMonthSelector(): void {
    if (this.transactions.length === 0) return;

    const months = new Set<string>();
    this.transactions.forEach(t => {
      const monthKey = `${t.date.getFullYear()}-${
          String(t.date.getMonth() + 1).padStart(2, '0')}`;
      months.add(monthKey);
    });

    const sortedMonths = Array.from(months).sort().reverse();

    this.monthSelect.innerHTML = '';
    sortedMonths.forEach(month => {
      const option = document.createElement('option');
      option.value = month;
      const [year, monthNum] = month.split('-');
      const monthName =
          new Date(parseInt(year), parseInt(monthNum) - 1)
              .toLocaleDateString('en-US', {month: 'long', year: 'numeric'});
      option.textContent = monthName;
      this.monthSelect.appendChild(option);
    });

    if (sortedMonths.length > 0) {
      this.updateCharts();
    }
  }

  private categorizeTransaction(transaction: Transaction): string {
    const desc = transaction.description.toUpperCase();
    const recipient = transaction.recipient.toUpperCase();

    if (transaction.type === 'expense') {
      if (desc.includes('REVOLUT') || desc.includes('PAYPAL'))
        return 'Digital Payments';
      if (desc.includes('MARKET') || desc.includes('TRGOVINA') ||
          desc.includes('SPAR') || desc.includes('MERCATOR'))
        return 'Groceries';
      if (desc.includes('RESTAVRACIJA') || desc.includes('GOSTINSTVO') ||
          desc.includes('FOOD'))
        return 'Restaurants';
      if (desc.includes('BENCIN') || desc.includes('PETROL') ||
          desc.includes('OMV'))
        return 'Gas';
      if (desc.includes('TELEKOM') || desc.includes('A1') ||
          desc.includes('TELEMACH'))
        return 'Telecom';
      if (recipient.includes('UNIVERZA')) return 'Education';
      if (desc.includes('ZAVAROVANJE')) return 'Insurance';
      if (desc.includes('NAJEMNINA') || desc.includes('RENT')) return 'Rent';
      return 'Other Expenses';
    } else {
      // Income categorization
      if (desc.includes('PLAČA') || desc.includes('SALARY') ||
          desc.includes('MEZDA'))
        return 'Salary';
      if (desc.includes('DIVIDENDA') || desc.includes('DIVIDEND'))
        return 'Dividends';
      if (desc.includes('OBRESTI') || desc.includes('INTEREST'))
        return 'Interest';
      if (desc.includes('NAKAZILO') || desc.includes('TRANSFER'))
        return 'Transfer';
      if (desc.includes('REFUND') || desc.includes('POVRAČILO'))
        return 'Refund';
      if (desc.includes('FREELANCE') || desc.includes('HONORAR'))
        return 'Freelance';
      if (desc.includes('GIFT') || desc.includes('DARILO')) return 'Gift';
      return 'Other Income';
    }
  }

  private updateCharts(): void {
    const selectedMonth = this.monthSelect.value;
    if (!selectedMonth) return;

    const [year, month] = selectedMonth.split('-').map(Number);

    // Filter transactions for the selected month
    const monthlyExpenses = this.transactions.filter(
        t => t.date.getFullYear() === year && t.date.getMonth() + 1 === month &&
            t.type === 'expense');

    const monthlyIncome = this.transactions.filter(
        t => t.date.getFullYear() === year && t.date.getMonth() + 1 === month &&
            t.type === 'income');

    if (this.currentChartType === 'pie') {
      if (this.currentView === 'category') {
        // Categorize expenses with transaction details
        this.currentExpenseData = this.getCategoryData(monthlyExpenses);
        this.currentIncomeData = this.getCategoryData(monthlyIncome);

        const expenseData = this.categoryDataToSpending(this.currentExpenseData);
        const incomeData = this.categoryDataToSpending(this.currentIncomeData);

        this.drawExpenseChart(expenseData);
        this.drawIncomeChart(incomeData);
        this.updateTotals(expenseData, incomeData);
      } else {
        // Group by recipient
        const expenseData = this.getTopRecipients(monthlyExpenses);
        const incomeData = this.getTopRecipients(monthlyIncome);

        this.drawExpenseChart(expenseData);
        this.drawIncomeChart(incomeData);
        this.updateTotals(expenseData, incomeData);
      }
    } else {
      // Daily view
      this.currentExpenseDailyData = this.getDailyData(monthlyExpenses);
      this.currentIncomeDailyData = this.getDailyData(monthlyIncome);

      this.drawDailyChart('expenseChart', this.currentExpenseDailyData, 'Expenses');
      this.drawDailyChart('incomeChart', this.currentIncomeDailyData, 'Income');
      this.updateTotals(
          this.dailyDataToSpending(this.currentExpenseDailyData),
          this.dailyDataToSpending(this.currentIncomeDailyData));
    }
  }

  private drawExpenseChart(expenseData: MonthlySpending): void {
    const canvas = document.getElementById('expenseChart') as HTMLCanvasElement;
    const ctx = canvas.getContext('2d');

    if (!ctx) return;

    if (this.expenseChart) {
      this.expenseChart.destroy();
      this.expenseChart = null;
    }

    const labels = Object.keys(expenseData);
    const data = Object.values(expenseData).map(v => Math.round(v * 100) / 100);

    if (data.length === 0 || data.every(v => v === 0)) {
      // No expense data - show empty state
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#666';
      ctx.font = '16px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(
          'No expenses this month', canvas.width / 2, canvas.height / 2);
      return;
    }

    this.expenseChart = new Chart(ctx, {
      type: 'pie',
      data: {
        labels: labels,
        datasets: [{
          data: data,
          backgroundColor: [
            '#FF6B6B', '#FF8E8E', '#FFB1B1', '#FFD4D4', '#FF9F43', '#FFC048',
            '#FFE04D', '#FFF352', '#FF6384', '#FF8FA3', '#FFBCC2', '#FFE8E1'
          ],
          borderWidth: 2,
          borderColor: '#fff'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend:
              {position: 'bottom', labels: {boxWidth: 12, font: {size: 11}}},
          tooltip: {
            callbacks: {
              label: (context) => {
                const label = context.label || '';
                const value = context.parsed || 0;
                const total = context.dataset.data.reduce(
                    (a: number, b: number) => a + b, 0);
                const percentage = ((value / total) * 100).toFixed(1);

                if (this.currentView === 'recipient') {
                  // For recipient view, show cleaner format
                  return `${label}: ${this.getCurrency()}${value.toFixed(2)} (${percentage}%)`;
                } else {
                  // For category view, show transaction details
                  const categoryData = this.currentExpenseData;
                  const transactions = categoryData[label]?.transactions || [];
                  
                  const result = [
                    `${label}: ${this.getCurrency()}${value.toFixed(2)} (${percentage}%)`,
                    `Transactions: ${transactions.length}`
                  ];
                  
                  // Show up to 3 sample transaction descriptions
                  const sampleTransactions = transactions.slice(0, 3);
                  sampleTransactions.forEach((t, i) => {
                    const desc = t.description.length > 30 ? t.description.substring(0, 30) + '...' : t.description;
                    result.push(`• ${desc}`);
                  });
                  
                  if (transactions.length > 3) {
                    result.push(`... and ${transactions.length - 3} more`);
                  }
                  
                  return result;
                }
              }
            }
          }
        }
      }
    });
  }

  private drawIncomeChart(incomeData: MonthlySpending): void {
    const canvas = document.getElementById('incomeChart') as HTMLCanvasElement;
    const ctx = canvas.getContext('2d');

    if (!ctx) return;

    if (this.incomeChart) {
      this.incomeChart.destroy();
      this.incomeChart = null;
    }

    const labels = Object.keys(incomeData);
    const data = Object.values(incomeData).map(v => Math.round(v * 100) / 100);

    if (data.length === 0 || data.every(v => v === 0)) {
      // No income data - show empty state
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#666';
      ctx.font = '16px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('No income this month', canvas.width / 2, canvas.height / 2);
      return;
    }

    this.incomeChart = new Chart(ctx, {
      type: 'pie',
      data: {
        labels: labels,
        datasets: [{
          data: data,
          backgroundColor: [
            '#4ECDC4', '#26D0CE', '#1DD1A1', '#00D2D3', '#55A3FF', '#5F95FF',
            '#6C5CE7', '#A29BFE', '#00B894', '#00CEC9', '#81ECEC', '#74B9FF'
          ],
          borderWidth: 2,
          borderColor: '#fff'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend:
              {position: 'bottom', labels: {boxWidth: 12, font: {size: 11}}},
          tooltip: {
            callbacks: {
              label: (context) => {
                const label = context.label || '';
                const value = context.parsed || 0;
                const total = context.dataset.data.reduce(
                    (a: number, b: number) => a + b, 0);
                const percentage = ((value / total) * 100).toFixed(1);

                if (this.currentView === 'recipient') {
                  // For recipient view, show cleaner format
                  return `${label}: ${this.getCurrency()}${value.toFixed(2)} (${percentage}%)`;
                } else {
                  // For category view, show transaction details
                  const categoryData = this.currentIncomeData;
                  const transactions = categoryData[label]?.transactions || [];
                  
                  const result = [
                    `${label}: ${this.getCurrency()}${value.toFixed(2)} (${percentage}%)`,
                    `Transactions: ${transactions.length}`
                  ];
                  
                  // Show up to 3 sample transaction descriptions
                  const sampleTransactions = transactions.slice(0, 3);
                  sampleTransactions.forEach((t, i) => {
                    const desc = t.description.length > 30 ? t.description.substring(0, 30) + '...' : t.description;
                    result.push(`• ${desc}`);
                  });
                  
                  if (transactions.length > 3) {
                    result.push(`... and ${transactions.length - 3} more`);
                  }
                  
                  return result;
                }
              }
            }
          }
        }
      }
    });
  }

  private switchChartView(view: 'category'|'recipient'): void {
    this.currentView = view;

    // Update button styles
    if (view === 'category') {
      this.categoryViewBtn.classList.add('active');
      this.recipientViewBtn.classList.remove('active');
    } else {
      this.recipientViewBtn.classList.add('active');
      this.categoryViewBtn.classList.remove('active');
    }

    // Refresh charts
    this.updateCharts();
  }

  private switchChartType(type: 'pie'|'daily'): void {
    this.currentChartType = type;

    // Update button styles
    if (type === 'pie') {
      this.pieChartBtn.classList.add('active');
      this.dailyChartBtn.classList.remove('active');
    } else {
      this.dailyChartBtn.classList.add('active');
      this.pieChartBtn.classList.remove('active');
    }

    // Refresh charts
    this.updateCharts();
  }

  private getTopRecipients(transactions: Transaction[]): MonthlySpending {
    const recipientMap = new Map<string, RecipientData>();

    transactions.forEach(t => {
      const cleanName = this.cleanRecipientName(t.recipient);
      if (cleanName === 'Unknown' || cleanName.length < 3) return;

      const existing = recipientMap.get(cleanName);
      if (existing) {
        existing.amount += t.amount;
        existing.count += 1;
      } else {
        recipientMap.set(
            cleanName, {name: cleanName, amount: t.amount, count: 1});
      }
    });

    // Get top 10 by amount, but also consider frequency
    const recipients = Array.from(recipientMap.values())
                           .sort((a, b) => {
                             // Sort by amount primarily, but boost frequent
                             // transactions
                             const scoreA = a.amount +
                                 (a.count * 10);  // Small bonus for frequency
                             const scoreB = b.amount + (b.count * 10);
                             return scoreB - scoreA;
                           })
                           .slice(0, 10);

    const result: MonthlySpending = {};
    recipients.forEach(r => {
      const label = `${r.name} (${r.count}x)`;
      result[label] = r.amount;
    });

    return result;
  }

  private cleanRecipientName(name: string): string {
    if (!name || name.trim() === '') return 'Unknown';

    let cleaned = name.trim().toUpperCase();

    // Remove common prefixes/suffixes
    cleaned = cleaned.replace(/^(PODJETJE|D\.O\.O\.|S\.P\.|K\.D\.)\s*/i, '');
    cleaned = cleaned.replace(/\s*(D\.O\.O\.|S\.P\.|K\.D\.)$/i, '');

    // Remove extra whitespace
    cleaned = cleaned.replace(/\s+/g, ' ').trim();

    // Limit length for display
    if (cleaned.length > 25) {
      cleaned = cleaned.substring(0, 22) + '...';
    }

    return cleaned || 'Unknown';
  }

  private getDailyData(transactions: Transaction[]): DailyData[] {
    const dailyMap = new Map<string, DailyData>();

    transactions.forEach(t => {
      const dateKey = t.date.toISOString().split('T')[0];  // YYYY-MM-DD format

      const existing = dailyMap.get(dateKey);
      if (existing) {
        existing.amount += t.amount;
        existing.count += 1;
        existing.transactions.push(t);
      } else {
        dailyMap.set(dateKey, {date: dateKey, amount: t.amount, count: 1, transactions: [t]});
      }
    });

    // Sort by date and return array
    return Array.from(dailyMap.values())
        .sort((a, b) => a.date.localeCompare(b.date));
  }

  private dailyDataToSpending(dailyData: DailyData[]): MonthlySpending {
    const total = dailyData.reduce((sum, day) => sum + day.amount, 0);
    return {'Total': total};
  }

  private getCategoryData(transactions: Transaction[]): CategoryData {
    const categoryData: CategoryData = {};
    
    transactions.forEach(t => {
      const category = this.categorizeTransaction(t);
      if (!categoryData[category]) {
        categoryData[category] = { amount: 0, transactions: [] };
      }
      categoryData[category].amount += t.amount;
      categoryData[category].transactions.push(t);
    });
    
    return categoryData;
  }

  private categoryDataToSpending(categoryData: CategoryData): MonthlySpending {
    const spending: MonthlySpending = {};
    Object.keys(categoryData).forEach(category => {
      spending[category] = categoryData[category].amount;
    });
    return spending;
  }

  private drawDailyChart(
      canvasId: string, dailyData: DailyData[], title: string): void {
    const canvas = document.getElementById(canvasId) as HTMLCanvasElement;
    const ctx = canvas.getContext('2d');

    if (!ctx) return;

    // Destroy existing chart
    if (canvasId === 'expenseChart' && this.expenseChart) {
      this.expenseChart.destroy();
      this.expenseChart = null;
    } else if (canvasId === 'incomeChart' && this.incomeChart) {
      this.incomeChart.destroy();
      this.incomeChart = null;
    }

    if (dailyData.length === 0) {
      // No data - show empty state
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#666';
      ctx.font = '16px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(
          `No ${title.toLowerCase()} this month`, canvas.width / 2,
          canvas.height / 2);
      return;
    }

    const labels = dailyData.map(d => {
      const date = new Date(d.date);
      return `${date.getDate()}/${date.getMonth() + 1}`;
    });
    const amounts = dailyData.map(d => Math.round(d.amount * 100) / 100);
    const counts = dailyData.map(d => d.count);

    const chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: `${title} Amount (${this.getCurrency()})`,
          data: amounts,
          borderColor: canvasId === 'expenseChart' ? '#FF6B6B' : '#4ECDC4',
          backgroundColor: canvasId === 'expenseChart' ? '#FF6B6B20' :
                                                         '#4ECDC420',
          borderWidth: 2,
          fill: true,
          tension: 0.3
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        scales: {
          y: {beginAtZero: true, title: {display: true, text: 'Amount (${this.getCurrency()})'}},
          x: {title: {display: true, text: 'Day of Month'}}
        },
        plugins: {
          legend: {position: 'top', labels: {boxWidth: 12, font: {size: 11}}},
          tooltip: {
            callbacks: {
              label: (context) => {
                const dayIndex = context.dataIndex;
                const amount = amounts[dayIndex];
                const count = counts[dayIndex];
                const date = dailyData[dayIndex].date;
                const transactions = dailyData[dayIndex].transactions;
                
                const result = [
                  `Date: ${date}`,
                  `Amount: ${this.getCurrency()}${amount.toFixed(2)}`,
                  `Transactions: ${count}`
                ];
                
                // Show up to 3 sample transaction descriptions
                const sampleTransactions = transactions.slice(0, 3);
                if (sampleTransactions.length > 0) {
                  result.push(''); // Add empty line for separation
                  sampleTransactions.forEach(t => {
                    const desc = t.description.length > 35 ? t.description.substring(0, 35) + '...' : t.description;
                    result.push(`• ${desc} (${this.getCurrency()}${t.amount.toFixed(2)})`);
                  });
                  
                  if (transactions.length > 3) {
                    result.push(`... and ${transactions.length - 3} more`);
                  }
                }
                
                return result;
              }
            }
          }
        }
      }
    });

    // Store chart reference
    if (canvasId === 'expenseChart') {
      this.expenseChart = chart;
    } else {
      this.incomeChart = chart;
    }
  }

  private updateTotals(
      expenseData: MonthlySpending, incomeData: MonthlySpending): void {
    const expenseTotal =
        Object.values(expenseData).reduce((sum, amount) => sum + amount, 0);
    const incomeTotal =
        Object.values(incomeData).reduce((sum, amount) => sum + amount, 0);

    const expenseTotalElement = document.getElementById('expenseTotal');
    const incomeTotalElement = document.getElementById('incomeTotal');

    if (expenseTotalElement) {
      expenseTotalElement.textContent = `${this.getCurrency()}${expenseTotal.toFixed(2)}`;
    }

    if (incomeTotalElement) {
      incomeTotalElement.textContent = `${this.getCurrency()}${incomeTotal.toFixed(2)}`;
    }
  }

  private isValidFileType(file: File): boolean {
    const validTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',  // .xlsx
      'application/vnd.ms-excel',  // .xls
      'text/csv'
    ];
    const validExtensions = ['.xlsx', '.xls', '.csv'];

    // Check basic file type support
    const isValidType = validTypes.includes(file.type) ||
        validExtensions.some(ext => file.name.toLowerCase().endsWith(ext));

    if (!isValidType) {
      return false;
    }

    // Special validation for Erste Bank - they use .xls format
    if (this.currentBank === 'erste') {
      const isXlsFile = file.name.toLowerCase().endsWith('.xls') ||
          file.type === 'application/vnd.ms-excel';
      if (!isXlsFile) {
        this.showError(
            'Erste Bank statements should be in .xls format. Please download your statement as Excel file from Erste Bank.');
        return false;
      }
    }

    return true;
  }

  private showFileInfo(file: File): void {
    this.fileInfo.innerHTML = `
            <strong>File:</strong> ${file.name}<br>
            <strong>Size:</strong> ${this.formatFileSize(file.size)}<br>
            <strong>Type:</strong> ${file.type || 'Unknown'}
        `;
    this.fileInfo.style.display = 'block';
  }

  private formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  private createSheetTabs(): void {
    if (this.parsedSheets.length <= 1) {
      this.sheetTabs.style.display = 'none';
      return;
    }

    this.sheetTabs.innerHTML = '';
    this.parsedSheets.forEach((sheet, index) => {
      const tab = document.createElement('div');
      tab.className = 'sheet-tab';
      tab.textContent = sheet.sheetName;
      tab.addEventListener('click', () => this.displaySheet(index));
      this.sheetTabs.appendChild(tab);
    });
    this.sheetTabs.style.display = 'block';
  }

  private displaySheet(index: number): void {
    this.currentSheetIndex = index;
    const sheet = this.parsedSheets[index];

    document.querySelectorAll('.sheet-tab').forEach((tab, i) => {
      tab.classList.toggle('active', i === index);
    });

    this.renderTable(sheet);
    this.showTable();
  }

  private renderTable(data: ParsedData): void {
    this.tableHead.innerHTML = '';
    this.tableBody.innerHTML = '';

    const headerRow = document.createElement('tr');
    data.headers.forEach(header => {
      const th = document.createElement('th');
      th.textContent = header;
      headerRow.appendChild(th);
    });
    this.tableHead.appendChild(headerRow);

    data.rows.forEach(row => {
      const tr = document.createElement('tr');
      data.headers.forEach((_, index) => {
        const td = document.createElement('td');
        td.textContent = row[index] || '';
        tr.appendChild(td);
      });
      this.tableBody.appendChild(tr);
    });
  }

  private showTable(): void {
    this.tableContainer.style.display = 'block';
  }

  private hideTable(): void {
    this.tableContainer.style.display = 'none';
    this.sheetTabs.style.display = 'none';
  }



  private showError(message: string): void {
    this.errorMessage.textContent = message;
    this.errorMessage.style.display = 'block';
  }

  private hideError(): void {
    this.errorMessage.style.display = 'none';
  }

  private showCharts(): void {
    this.chartsContainer.style.display = 'block';
  }

  private hideCharts(): void {
    this.chartsContainer.style.display = 'none';
  }

  private setMainLogo(): void {
    if (this.mainLogo) {
      this.mainLogo.src = bankBeeLogo;
      this.mainLogo.alt = 'Bank Bee CSV Logo';
    }
  }

  private updateBankLogo(): void {
    const config = bankConfigs[this.currentBank];
    if (this.bankLogo && config) {
      this.bankLogo.src = config.logo;
      this.bankLogo.alt = `${config.name} Logo`;
    }
    this.updateUploadText();
  }

  private updateUploadText(): void {
    const config = bankConfigs[this.currentBank];
    if (this.uploadText && this.uploadSubtext && config) {
      if (this.currentBank === 'erste') {
        this.uploadText.textContent =
            'Drag and drop your Erste Bank .xls statement file here';
        this.uploadSubtext.textContent =
            'Download as Excel file (Erste Bank online banking)';
      } else {
        this.uploadText.textContent =
            `Drag and drop your ${config.name} CSV statement file here`;
        this.uploadSubtext.textContent =
            'Download from your bank\'s statements page with appropriate date filters';
      }
    }
  }

  private handleBankChange(event: Event): void {
    const select = event.target as HTMLSelectElement;
    this.currentBank = select.value;
    this.updateBankLogo();

    // Clear any existing data when switching banks
    this.hideTable();
    this.hideCharts();
    this.hideError();
    this.parsedSheets = [];
    this.transactions = [];
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new ExcelParser();
});