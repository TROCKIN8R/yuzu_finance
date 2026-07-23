import type { InputHTMLAttributes } from 'react'
import { numberFieldValue, parseNumberField } from '../lib/format'
import { inputClass } from './Field'

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> & {
  value: number
  onChange: (value: number) => void
}

export function NumberInput({ value, onChange, className, ...rest }: Props) {
  return (
    <input
      {...rest}
      type="number"
      className={className ?? inputClass}
      value={numberFieldValue(value)}
      onChange={(e) => onChange(parseNumberField(e.target.value))}
    />
  )
}
