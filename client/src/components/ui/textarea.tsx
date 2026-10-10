'use client';

import { TextArea as HeroTextArea } from '@heroui/react';
import type { ComponentPropsWithRef } from 'react';
import { forwardRef } from 'react';

type HeroTextAreaProps = ComponentPropsWithRef<typeof HeroTextArea>;
type TextareaProps = HeroTextAreaProps;

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>((props, ref) => <HeroTextArea ref={ref} {...props} />);

Textarea.displayName = 'Textarea';
