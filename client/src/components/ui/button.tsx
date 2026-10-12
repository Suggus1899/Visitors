'use client';

import { Button as HeroButton } from '@heroui/react';
import type { ButtonHTMLAttributes, ComponentProps } from 'react';
import { forwardRef } from 'react';

type HeroProps = ComponentProps<typeof HeroButton>;
type LegacyVariant = 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
type LegacySize = 'default' | 'sm' | 'lg' | 'icon';

type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'size' | 'value' | 'onClick' | 'onFocus' | 'onBlur'> & {
  value?: string;
  onClick?: HeroProps['onPress'];
  onFocus?: HeroProps['onFocus'];
  onBlur?: HeroProps['onBlur'];
  variant?: LegacyVariant;
  size?: LegacySize;
  fullWidth?: HeroProps['fullWidth'];
};

const variants: Record<LegacyVariant, NonNullable<HeroProps['variant']>> = {
  default: 'primary', destructive: 'danger', outline: 'outline', secondary: 'secondary', ghost: 'tertiary', link: 'tertiary',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'ghost', size, disabled, className, fullWidth, title, onClick, ...props }, ref) => (
    <HeroButton
      ref={node => {
        if (node && title) node.title = title;
        if (typeof ref === 'function') ref(node);
        else if (ref) ref.current = node;
      }}
      variant={variants[variant]}
      size={size === 'default' ? 'md' : size === 'icon' ? 'sm' : size}
      isIconOnly={size === 'icon'}
      isDisabled={disabled}
      fullWidth={fullWidth}
      onPress={onClick}
      className={className}
      {...props}
    />
  ),
);

Button.displayName = 'Button';
