/**
 * Component tests: NoticeCard and StatusBadge rendering, including the
 * acceptance cases (null deadline, missing optional fields, verify badge)
 * and accessibility contracts.
 *
 * Note: @testing-library/react-native v14 render() is async.
 */
import { fireEvent, render } from '@testing-library/react-native';
import { NoticeCard } from '../src/features/notices/NoticeCard';
import { StatusBadge } from '../src/features/notices/StatusBadge';
import {
  NOTICE_STATUSES,
  NOTICE_STATUS_LABELS,
  type Notice,
  type NoticeStatus,
} from '../src/utils/types';

function makeNotice(overrides: Partial<Notice> = {}): Notice {
  return {
    id: 'notice-1',
    type: 'submission',
    title: 'CS 4026 Design Review submission',
    status: 'closing',
    deadline: null,
    deadlinePhrase: null,
    confidence: 0.6,
    needsVerify: false,
    source: 'TechLMS',
    sourceLink: '',
    rawText: '',
    createdAt: new Date(2025, 10, 1, 8, 0),
    updatedAt: new Date(2025, 10, 10, 12, 0),
    ...overrides,
  };
}

describe('NoticeCard', () => {
  it('renders with a null deadline and missing optional fields', async () => {
    const view = await render(<NoticeCard notice={makeNotice()} onPress={jest.fn()} />);
    expect(view.getByText('CS 4026 Design Review submission')).toBeTruthy();
    expect(view.getByText('No deadline')).toBeTruthy();
    expect(view.getByText('Submission')).toBeTruthy();
    expect(view.getByText('Closing')).toBeTruthy();
  });

  it('shows the deadline line with date and relative time', async () => {
    // +30 min buffer keeps the "in 2 days" floor stable against test overhead.
    const notice = makeNotice({
      deadline: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000 + 30 * 60 * 1000),
    });
    const view = await render(<NoticeCard notice={notice} onPress={jest.fn()} />);
    expect(view.getByText(/in 2 days/)).toBeTruthy();
  });

  it('shows the Verify badge only when needsVerify is true', async () => {
    const onPress = jest.fn();
    const withVerify = await render(
      <NoticeCard notice={makeNotice({ needsVerify: true })} onPress={onPress} />,
    );
    expect(withVerify.getByText('Verify')).toBeTruthy();

    const withoutVerify = await render(
      <NoticeCard notice={makeNotice({ needsVerify: false })} onPress={onPress} />,
    );
    expect(withoutVerify.queryByText('Verify')).toBeNull();
  });

  it('exposes a rich accessibility label and is pressable', async () => {
    const onPress = jest.fn();
    const view = await render(<NoticeCard notice={makeNotice()} onPress={onPress} />);
    const card = view.getByLabelText(/CS 4026 Design Review submission/);
    fireEvent.press(card);
    expect(onPress).toHaveBeenCalledWith('notice-1');
  });
});

describe('StatusBadge', () => {
  it.each(NOTICE_STATUSES)(
    'renders icon AND text for status %s (never color alone)',
    async (status: NoticeStatus) => {
      const view = await render(<StatusBadge status={status} />);
      expect(view.getByText(NOTICE_STATUS_LABELS[status])).toBeTruthy();
    },
  );

  it('exposes an accessibility label with the status', async () => {
    const view = await render(<StatusBadge status="closing" />);
    expect(view.getByLabelText('Status: Closing')).toBeTruthy();
  });
});
