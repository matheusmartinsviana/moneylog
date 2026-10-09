import { provideRouter } from '@angular/router';
import { render, screen } from '@testing-library/angular';

import { pt } from '~/app/common/i18n/translations/pt';
import { UpcomingBriefComponent } from '~/app/features/home/components/upcoming-brief/upcoming-brief.component';
import type { Upcoming, UpcomingItem } from '~/modules/dashboard/core/types/upcoming';
import { brl } from '~/testing/accounts-testing';
import { axeViolations, describeViolations } from '~/testing/axe';
import { provideI18nTesting } from '~/testing/i18n-testing';

const item = (
  label: string,
  bucket: UpcomingItem['bucket'],
  direction: UpcomingItem['direction'] = 'OUT',
): UpcomingItem => ({
  kind: 'RECURRENCE',
  bucket,
  dueDate: '2026-10-12',
  direction,
  amount: brl('119.00'),
  label,
  refType: 'RECURRENCE',
  refId: label,
  items: [],
});

const upcoming = (items: UpcomingItem[]): Upcoming => ({
  items,
  undated: [],
  totals: { out: brl('0.00'), in: brl('0.00') },
  overdueTruncated: false,
});

async function setup(value: Upcoming) {
  return render(UpcomingBriefComponent, {
    inputs: { upcoming: value },
    providers: [provideI18nTesting('pt'), provideRouter([])],
  });
}

describe('UpcomingBriefComponent', () => {
  it('Dado vencidos, hoje, amanhã e 7 dias, então mostra no máximo 3, na ordem do servidor, e deixa de fora o que é mais adiante', async () => {
    await setup(
      upcoming([
        item('Fatura', 'OVERDUE'),
        item('Luz', 'TODAY'),
        item('Internet', 'TOMORROW'),
        item('Academia', 'NEXT_7_DAYS'),
        item('Seguro', 'NEXT_30_DAYS'),
      ]),
    );

    expect(screen.getAllByTestId('home-upcoming-item')).toHaveLength(3);
    expect(screen.getByText('Fatura')).toBeInTheDocument();
    expect(screen.getByText('Internet')).toBeInTheDocument();
    expect(screen.queryByText('Academia')).not.toBeInTheDocument();
    expect(screen.queryByText('Seguro')).not.toBeInTheDocument();
    expect(screen.getAllByText('Vence em 12 de out.').length).toBeGreaterThan(0);
  });

  it('Dado uma entrada, então o valor vem destacado como entrada e o link leva ao Panorama', async () => {
    await setup(upcoming([item('João', 'NEXT_7_DAYS', 'IN')]));

    expect(screen.getByTestId('home-upcoming-amount')).toHaveClass('is-incoming');
    expect(screen.getByTestId('home-upcoming-all')).toHaveAttribute('href', '/planning/overview');
  });

  it('Dado nenhum compromisso na janela, então diz que nada vence, sem inventar item', async () => {
    await setup(upcoming([item('Seguro', 'LATER')]));

    expect(screen.getByTestId('home-upcoming-empty')).toHaveTextContent(pt.brief.upcoming.empty);
    expect(screen.queryByTestId('home-upcoming-item')).not.toBeInTheDocument();
  });

  it('Dado a lista, então não há violações de acessibilidade', async () => {
    const { container } = await setup(upcoming([item('Luz', 'TODAY')]));

    const violations = await axeViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });
});
