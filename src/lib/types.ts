export type PaymentMethod = "card" | "pix";
export type ExpenseKind = "variable" | "fixed_recurring" | "fixed_installment";
export type EntryKind = "one_time" | "recurring";

/** Quem estamos olhando: só eu, ou nós dois somados. */
export type Scope = "me" | "us";

export type Profile = {
  id: string;
  household_id: string | null;
  display_name: string;
  /** Cor de identidade, escolhida pela própria pessoa (hex da PALETTE). */
  color: string;
  /** Cartão que define o mês desta pessoa. Nulo = mês do calendário. */
  anchor_card_id: string | null;
};

export type Card = {
  id: string;
  user_id: string;
  name: string;
  closing_day: number | null;
  due_day: number | null;
  color: string | null;
  archived: boolean;
  /** Conta que paga a fatura deste cartão. Opcional. */
  bank_account_id: string | null;
};

export type Category = {
  id: string;
  user_id: string;
  name: string;
  color: string;
  archived: boolean;
};

export type Income = {
  id: string;
  user_id: string;
  source: string;
  amount: number;
  kind: EntryKind;
  start_date: string;
  end_date: string | null;
  notes: string | null;
};

export type Expense = {
  id: string;
  user_id: string;
  payment_method: PaymentMethod;
  kind: ExpenseKind;
  card_id: string | null;
  category_id: string | null;
  description: string;
  amount: number;
  start_date: string;
  end_date: string | null;
  installments_total: number | null;
  notes: string | null;
  /** Só no Pix: de qual conta o dinheiro saiu. É o que faz o Pix entrar
      no ciclo de fatura do cartão daquela conta. */
  bank_account_id: string | null;
};

export type Investment = {
  id: string;
  user_id: string;
  name: string;
  asset_type: string;
  amount: number;
  kind: EntryKind;
  start_date: string;
  end_date: string | null;
  notes: string | null;
};

/** Retorno de public.monthly_summary() */
export type MonthlySummaryRow = {
  month: string;
  user_id: string;
  income: number;
  expense: number;
  investment: number;
};

/** Retorno de public.category_ranking() */
export type CategoryRankingRow = {
  user_id: string;
  category_name: string;
  color: string;
  total: number;
  entries: number;
};

export const EXPENSE_KIND_LABEL: Record<ExpenseKind, string> = {
  variable: "Variável",
  fixed_recurring: "Fixo mensal",
  fixed_installment: "Parcelado",
};

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  card: "Cartão",
  pix: "Pix",
};

/** Retorno de public.expense_occurrences() — um gasto por mês em que ele cai. */
export type ExpenseOccurrence = {
  expense_id: string;
  user_id: string;
  month: string;
  amount: number;
  payment_method: PaymentMethod;
  kind: ExpenseKind;
  card_id: string | null;
  category_id: string | null;
  description: string;
  installment_number: number | null;
  installments_total: number | null;
};

/** Retorno de public.income_occurrences() */
export type IncomeOccurrence = {
  income_id: string;
  user_id: string;
  month: string;
  amount: number;
  source: string;
};

/** Retorno de public.investment_occurrences() */
export type InvestmentOccurrence = {
  investment_id: string;
  user_id: string;
  month: string;
  amount: number;
  name: string;
  asset_type: string;
};

export const ENTRY_KIND_LABEL: Record<EntryKind, string> = {
  one_time: "Avulsa",
  recurring: "Todo mês",
};

/** Conta bancária. Privada, mesma regra do cartão. */
export type BankAccount = {
  id: string;
  user_id: string;
  name: string;
  color: string;
  archived: boolean;
};

/** Retorno de public.card_cycle_bounds() */
export type CycleBounds = {
  cycle_start: string;
  cycle_end: string;
  due_date: string | null;
};

/** Retorno de public.cycle_expense_detail() */
export type CycleExpenseRow = {
  expense_id: string;
  occurred_on: string;
  description: string;
  amount: number;
  payment_method: PaymentMethod;
  kind: ExpenseKind;
  category_id: string | null;
  installment_number: number | null;
  installments_total: number | null;
};

/** Retorno de public.cycle_summary() */
export type CycleSummaryRow = {
  total: number;
  entries: number;
};

/** Retorno de public.income_in_window() — renda projetada por dia. */
export type IncomeInWindowRow = {
  income_id: string;
  user_id: string;
  occurred_on: string;
  amount: number;
  source: string;
};

/** Retorno de public.cycle_category_ranking() — sem user_id: o ciclo já é
    de uma pessoa só, então não existe visão de casal aqui. */
export type CycleCategoryRow = {
  category_name: string;
  color: string;
  total: number;
  entries: number;
};

/** Retorno de public.expenses_in_window() — gasto projetado por dia. */
export type ExpenseInWindowRow = {
  expense_id: string;
  user_id: string;
  occurred_on: string;
  description: string;
  amount: number;
  payment_method: PaymentMethod;
  kind: ExpenseKind;
  card_id: string | null;
  category_id: string | null;
  installment_number: number | null;
  installments_total: number | null;
};

/** Retorno de public.investments_in_window() */
export type InvestmentInWindowRow = {
  investment_id: string;
  user_id: string;
  occurred_on: string;
  amount: number;
  name: string;
  asset_type: string;
};

/** A casa. Só o nome é editável; qualquer membro renomeia. */
export type Household = {
  id: string;
  name: string;
};

/** Convite por link (household_invites). O token é o que vai na URL. */
export type HouseholdInvite = {
  id: string;
  household_id: string;
  token: string;
  /** 8 caracteres sem ambiguidade (sem 0/O, 1/I/L). Vai por telefone. */
  code: string | null;
  created_by: string;
  invited_email: string | null;
  status: "pending" | "accepted" | "revoked" | "expired";
  expires_at: string;
  created_at: string;
};

/** Retorno de public.get_invite() — só o que a página do convite mostra. */
export type InviteInfo = {
  household_name: string;
  inviter_name: string;
  inviter_color: string;
  member_count: number;
  expires_at: string;
  email_locked: boolean;
};
