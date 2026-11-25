import { Cell } from './List';

interface Props {
	label: string;
	value: string;
	tone?: 'good' | 'bad';
}

/** A label/value line inside a grouped list. */
export const StatusRow = ({ label, value, tone }: Props) => <Cell label={label} value={value} tone={tone} />;
