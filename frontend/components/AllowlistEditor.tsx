'use client';

import * as stylex from '@stylexjs/stylex';
import { arrayRemove, arrayUnion, doc, setDoc, updateDoc } from 'firebase/firestore';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { useAuth } from '../lib/auth';
import { getDb } from '../lib/firebaseClient';
import { useDoc } from '../lib/useDoc';
import { form } from './formStyles';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const AllowlistEditor = () => {
	const allowlist = useDoc<{ emails?: string[] }>('config/allowlist');
	const { user } = useAuth();
	const [email, setEmail] = useState('');
	const [error, setError] = useState<string | null>(null);

	const me = user?.email?.toLowerCase() ?? null;
	const emails = [...(allowlist.data?.emails ?? [])].sort();

	const run = async (write: () => Promise<void>) => {
		try {
			await write();
			return true;
		} catch {
			setError('Could not save the allowlist.');
			return false;
		}
	};

	const add = async (e: FormEvent) => {
		e.preventDefault();
		const value = email.trim().toLowerCase();
		if (!EMAIL.test(value)) {
			setError('Enter a valid email address.');
			return;
		}
		setError(null);
		if (
			await run(() => setDoc(doc(getDb(), 'config', 'allowlist'), { emails: arrayUnion(value) }, { merge: true }))
		)
			setEmail('');
	};

	const remove = async (value: string) => {
		setError(null);
		await run(() => updateDoc(doc(getDb(), 'config', 'allowlist'), { emails: arrayRemove(value) }));
	};

	return (
		<section aria-label='Allowed emails' {...stylex.props(form.section)}>
			<h2 {...stylex.props(form.heading)}>Who can sign in</h2>
			{allowlist.error ? (
				<p role='alert' {...stylex.props(form.error)}>
					Couldn&rsquo;t load the allowlist
				</p>
			) : null}
			<ul {...stylex.props(form.list)}>
				{emails.map(value => (
					<li key={value} {...stylex.props(form.item)}>
						<span>{value}</span>
						<button
							type='button'
							aria-label={`Remove ${value}`}
							disabled={me === null || value.toLowerCase() === me}
							onClick={() => void remove(value)}
							{...stylex.props(form.secondary)}
						>
							Remove
						</button>
					</li>
				))}
			</ul>
			<form onSubmit={e => void add(e)} noValidate {...stylex.props(form.row)}>
				<input
					type='email'
					aria-label='Email to add'
					placeholder='name@example.com'
					value={email}
					onChange={e => setEmail(e.target.value)}
					{...stylex.props(form.input)}
				/>
				<button type='submit' {...stylex.props(form.button)}>
					Add email
				</button>
			</form>
			{error ? (
				<p role='alert' {...stylex.props(form.error)}>
					{error}
				</p>
			) : null}
		</section>
	);
};
