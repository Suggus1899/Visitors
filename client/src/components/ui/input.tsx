'use client';

import { Input as HeroInput } from '@heroui/react';
import type { ComponentPropsWithRef } from 'react';
import { forwardRef } from 'react';

type HeroInputProps = ComponentPropsWithRef<typeof HeroInput>;
type InputProps = HeroInputProps;

export const Input = forwardRef<HTMLInputElement, InputProps>((props, ref) => <HeroInput ref={ref} variant="secondary" {...props} />);

Input.displayName = 'Input';
