import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { useSelectedDate } from '../App';
import { addDays, relativeDay } from '../lib/date';

/** Opens the system calendar to jump to any day. The real date input sits invisibly on top. */
export function DatePick({ showLabel }: { showLabel?: boolean }) {
  const [date, setDate] = useSelectedDate();
  return (
    <label className="date-pick" title="Go to a date">
      {showLabel ? relativeDay(date) : <CalendarDays size={19} />}
      <input type="date" aria-label="Go to a date" value={date} onChange={(e) => { if (e.target.value) setDate(e.target.value); }} />
    </label>
  );
}

/** Previous day, the current day, next day. Everything logged goes to the day shown here. */
export function DateSwitch() {
  const [date, setDate] = useSelectedDate();
  return (
    <div className="date-switch">
      <button className="icon-btn sm" aria-label="Previous day" onClick={() => setDate(addDays(date, -1))}><ChevronLeft size={17} /></button>
      <DatePick showLabel />
      <button className="icon-btn sm" aria-label="Next day" onClick={() => setDate(addDays(date, 1))}><ChevronRight size={17} /></button>
    </div>
  );
}
