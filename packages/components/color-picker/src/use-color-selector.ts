import type {
  CSSUIObject,
  HTMLUIProps,
  UIPropGetter,
  ThemeProps,
  RequiredUIPropGetter,
} from "@yamada-ui/core"
import {
  useFormControlProps,
  type FormControlOptions,
  formControlProperties,
} from "@yamada-ui/form-control"
import type { InputProps } from "@yamada-ui/input"
import { useControllableState } from "@yamada-ui/use-controllable-state"
import { useEyeDropper } from "@yamada-ui/use-eye-dropper"
import type { ColorFormat, Dict, Merge } from "@yamada-ui/utils"
import {
  calcFormat,
  convertColor,
  createContext,
  handlerAll,
  hsvTo,
  isString,
  parseToHsv,
  useCallbackRef,
  useUpdateEffect,
  omitObject,
  parseToRgba,
  parseToHsla,
  rgbaTo,
  hslaTo,
  pickObject,
} from "@yamada-ui/utils"
import type { ChangeEvent } from "react"
import { useCallback, useMemo, useRef, useState } from "react"
import type { AlphaSliderProps } from "./alpha-slider"
import type { ColorSwatchProps } from "./color-swatch"
import type { HueSliderProps } from "./hue-slider"
import type { SaturationSliderProps } from "./saturation-slider"

type Space = keyof Hsla | keyof Rgba
type Hsla = { h: number; s: number; l: number; a: number }
type Rgba = { r: number; g: number; b: number; a: number }
type Hsva = { h: number; s: number; v: number; a: number }
type Channel = {
  label: string
  space: Space
  value: number
  min: number
  max: number
}

const convertHsla = (value: string, fallback?: string): Hsla => {
  let [h, s, l, a] = parseToHsla(value, fallback) ?? [0, 0, 1, 1]

  if (a > 1) a = 1

  return { h, s, l, a }
}

const convertRgba = (value: string, fallback?: string): Rgba => {
  let [r, g, b, a] = parseToRgba(value, fallback) ?? [255, 255, 255, 1]

  if (r > 255) r = 255
  if (g > 255) g = 255
  if (b > 255) b = 255
  if (a > 1) a = 1

  return { r, g, b, a }
}

const convertHsva = (value: string, fallback?: string): Hsva => {
  const [h, s, v, a] = parseToHsv(value, fallback)

  return { h, s, v, a }
}

type ColorSelectorContext = {
  value: string
  onChange: (value: string | Partial<Hsva>) => void
  eyeDropperSupported: boolean
  withAlpha: boolean
  isInteractive: boolean
  disabled?: boolean
  readOnly?: boolean
  channels: Channel[]
  size?: ThemeProps<"ColorSelector">["size"]
  getHueSliderProps: UIPropGetter<"input", HueSliderProps, HueSliderProps>
  getAlphaSliderProps: UIPropGetter<"input", AlphaSliderProps, AlphaSliderProps>
  getEyeDropperProps: UIPropGetter<"button">
  getChannelProps: RequiredUIPropGetter<
    "input",
    Merge<InputProps, { space: Space }>,
    InputProps
  >
  getSwatchProps: UIPropGetter<"div", ColorSwatchProps, ColorSwatchProps>
  styles: Record<string, CSSUIObject>
}

export const [ColorSelectorProvider, useColorSelectorContext] =
  createContext<ColorSelectorContext>({
    name: "ColorSelectorContext",
    errorMessage: `useColorSelectorContext returned is 'undefined'. Seems you forgot to wrap the components in "<ColorSelector />"`,
  })

type UseColorSelectorOptions = {
  /**
   * The base `id` to use for the color selector.
   */
  id?: string
  /**
   * The name attribute of the hidden `input` field.
   * This is particularly useful in forms.
   */
  name?: string
  /**
   * The value of the color selector.
   */
  value?: string
  /**
   * The initial value of the color selector.
   *
   * @default "#ffffff"
   */
  defaultValue?: string
  /**
   * The fallback value returned when color determination fails.
   */
  fallbackValue?: string
  /**
   * Function called whenever the color selector value changes.
   */
  onChange?: (value: string) => void
  /**
   * Function called when the user starts selecting a new value.
   */
  onChangeStart?: (value: string) => void
  /**
   * Function called when the user is done selecting a new value.
   */
  onChangeEnd?: (value: string) => void
  /**
   * Color format. For example, `hex`, `rgba`, etc.
   *
   * @default "hexa"
   */
  format?: ColorFormat
  /**
   * Function called whenever the color swatch click.
   */
  onSwatchClick?: (value: string) => void
}

export type UseColorSelectorBaseProps = UseColorSelectorOptions &
  FormControlOptions

export type UseColorSelectorProps = Omit<
  HTMLUIProps<"div">,
  "defaultValue" | "onChange" | "children"
> &
  UseColorSelectorBaseProps

export const useColorSelector = ({
  isInvalid,
  ...props
}: UseColorSelectorProps) => {
  let {
    id,
    name,
    value: valueProp,
    defaultValue,
    fallbackValue,
    onChange: onChangeProp,
    onChangeStart: onChangeStartProp,
    onChangeEnd: onChangeEndProp,
    format,
    required,
    disabled,
    readOnly,
    onSwatchClick,
    ...rest
  } = useFormControlProps({ isInvalid, ...props })

  const onChangeStartRef = useCallbackRef(onChangeStartProp)
  const onChangeEndRef = useCallbackRef(onChangeEndProp)
  const { supported: eyeDropperSupported, onOpen } = useEyeDropper()
  const [value, setValue] = useControllableState({
    value: valueProp,
    defaultValue: defaultValue ?? fallbackValue ?? "#ffffff",
    onChange: onChangeProp,
  })
  const timeoutId = useRef<any>(undefined)
  const formatRef = useRef<ColorFormat>(format ?? calcFormat(value))
  const isDraggingRef = useRef<boolean>(false)
  const [parsedValue, setParsedValue] = useState<Hsva>(
    convertHsva(value, fallbackValue),
  )
  const { h, s, v, a } = parsedValue
  const withAlpha = formatRef.current.endsWith("a")
  const isInteractive = !(disabled || readOnly)

  const channels: Channel[] = useMemo(() => {
    if (value.startsWith("hsl")) {
      const { h, s, l, a } = convertHsla(value, fallbackValue)

      let channels: Channel[] = [
        { label: "H", space: "h", value: Math.round(h), min: 0, max: 360 },
        {
          label: "S(%)",
          space: "s",
          value: Math.round(s * 100),
          min: 0,
          max: 100,
        },
        {
          label: "L(%)",
          space: "l",
          value: Math.round(l * 100),
          min: 0,
          max: 100,
        },
      ]

      if (withAlpha) {
        channels = [
          ...channels,
          {
            label: "A(%)",
            space: "a",
            value: Math.round(a * 100),
            min: 0,
            max: 100,
          },
        ]
      }

      return channels
    } else {
      const { r, g, b, a } = convertRgba(value, fallbackValue)

      let channels: Channel[] = [
        { label: "R", space: "r", value: Math.round(r), min: 0, max: 255 },
        { label: "G", space: "g", value: Math.round(g), min: 0, max: 255 },
        { label: "B", space: "b", value: Math.round(b), min: 0, max: 255 },
      ]

      if (withAlpha) {
        channels = [
          ...channels,
          {
            label: "A(%)",
            space: "a",
            value: Math.round(a * 100),
            min: 0,
            max: 100,
          },
        ]
      }

      return channels
    }
  }, [value, withAlpha, fallbackValue])

  const onChange = useCallback(
    (value: string | Partial<Hsva>) => {
      if (isString(value)) {
        setParsedValue(convertHsva(value, fallbackValue))
      } else {
        setParsedValue((prev) => ({ ...prev, ...value }))
      }
    },
    [fallbackValue],
  )

  const onChangeStart = useCallback(
    (value: Partial<Hsva>) => {
      window.clearTimeout(timeoutId.current)

      isDraggingRef.current = true

      const { h, s, v, a } = { ...parsedValue, ...value }

      const nextValue = hsvTo([h, s, v, a], fallbackValue)(formatRef.current)

      if (nextValue) onChangeStartRef(nextValue)
    },
    [formatRef, onChangeStartRef, fallbackValue, parsedValue],
  )

  const onChangeEnd = useCallback(
    (value: string | Partial<Hsva>) => {
      window.clearTimeout(timeoutId.current)

      timeoutId.current = window.setTimeout(() => {
        isDraggingRef.current = false
      }, 200)

      let nextValue: string | undefined

      if (isString(value)) {
        nextValue = convertColor(value, fallbackValue)(formatRef.current)
      } else {
        const { h, s, v, a } = { ...parsedValue, ...value }

        nextValue = hsvTo([h, s, v, a], fallbackValue)(formatRef.current)
      }

      if (nextValue) onChangeEndRef(nextValue)
    },
    [formatRef, onChangeEndRef, fallbackValue, parsedValue],
  )

  const onChannelChange = useCallback(
    (ev: ChangeEvent<HTMLInputElement>, space: Space) => {
      let n = Math.floor(parseFloat(ev.target.value))

      if (isNaN(n)) n = 0

      if (["s", "l", "a"].includes(space)) n = n / 100

      let nextValue: string | undefined

      if (value.startsWith("hsl")) {
        const { h, s, l, a } = Object.assign(
          convertHsla(value, fallbackValue),
          { [space]: n },
        )

        nextValue = hslaTo([h, s, l, a], fallbackValue)(formatRef.current)
      } else {
        const { r, g, b, a } = Object.assign(
          convertRgba(value, fallbackValue),
          { [space]: n },
        )

        nextValue = rgbaTo([r, g, b, a], fallbackValue)(formatRef.current)
      }

      if (!nextValue) return

      onChange(nextValue)
      onChangeEnd(nextValue)
    },
    [value, onChange, onChangeEnd, formatRef, fallbackValue],
  )

  const onEyeDropperClick = useCallback(async () => {
    try {
      const { sRGBHex } = (await onOpen()) ?? {}

      if (!sRGBHex) return

      onChange(sRGBHex)
      onChangeEnd(sRGBHex)
    } catch {}
  }, [onOpen, onChange, onChangeEnd])

  useUpdateEffect(() => {
    const value = hsvTo([h, s, v, a], fallbackValue)(formatRef.current)

    if (value) setValue(value)
  }, [h, s, v, a, fallbackValue])

  useUpdateEffect(() => {
    if (isDraggingRef.current) return

    if (valueProp) setParsedValue(convertHsva(valueProp, fallbackValue))
  }, [valueProp])

  useUpdateEffect(() => {
    if (!format) return

    formatRef.current = format

    const nextValue = convertColor(value, fallbackValue)(format)

    if (nextValue) setValue(nextValue)
  }, [format, fallbackValue])

  const getContainerProps: UIPropGetter = (props = {}, ref = null) => ({
    ...props,
    ref,
    ...omitObject(rest, ["aria-readonly"]),
  })

  const getInputProps: UIPropGetter<"input"> = useCallback(
    (props = {}, ref = null) => ({
      ...pickObject(rest, formControlProperties),
      ...props,
      id,
      ref,
      type: "hidden",
      name,
      value,
      required,
      disabled,
      readOnly,
    }),
    [disabled, id, name, readOnly, required, rest, value],
  )

  const getSaturationSliderProps: UIPropGetter<
    "input",
    SaturationSliderProps,
    SaturationSliderProps
  > = useCallback(
    (props = {}, ref = null) => ({
      required,
      disabled,
      readOnly,
      isInvalid,
      ...props,
      ref,
      value: [h, s, v],
      onChange: handlerAll(props.onChange, ([, s, v]) => onChange({ s, v })),
      onChangeStart: handlerAll(props.onChangeStart, ([, s, v]) =>
        onChangeStart({ s, v }),
      ),
      onChangeEnd: handlerAll(props.onChangeEnd, ([, s, v]) =>
        onChangeEnd({ s, v }),
      ),
    }),
    [
      required,
      disabled,
      readOnly,
      isInvalid,
      h,
      s,
      v,
      onChange,
      onChangeStart,
      onChangeEnd,
    ],
  )

  const getHueSliderProps: UIPropGetter<
    "input",
    HueSliderProps,
    HueSliderProps
  > = useCallback(
    (props = {}, ref = null) => ({
      required,
      disabled,
      readOnly,
      isInvalid,
      ...props,
      ref,
      value: h,
      onChange: handlerAll(props.onChange, (h) => onChange({ h })),
      onChangeStart: handlerAll(props.onChangeStart, (h) =>
        onChangeStart({ h }),
      ),
      onChangeEnd: handlerAll(props.onChangeEnd, (h) => onChangeEnd({ h })),
    }),
    [
      required,
      disabled,
      readOnly,
      isInvalid,
      h,
      onChange,
      onChangeStart,
      onChangeEnd,
    ],
  )

  const getAlphaSliderProps: UIPropGetter<
    "input",
    AlphaSliderProps,
    AlphaSliderProps
  > = useCallback(
    (props = {}, ref = null) => ({
      required,
      disabled,
      readOnly,
      isInvalid,
      ...props,
      ref,
      value: a,
      color: hsvTo([h, s, v, a], fallbackValue)(formatRef.current),
      onChange: handlerAll(props.onChange, (a) => onChange({ a })),
      onChangeStart: handlerAll(props.onChangeStart, (a) =>
        onChangeStart({ a }),
      ),
      onChangeEnd: handlerAll(props.onChangeEnd, (a) => onChangeEnd({ a })),
    }),
    [
      fallbackValue,
      required,
      disabled,
      readOnly,
      isInvalid,
      formatRef,
      h,
      s,
      v,
      a,
      onChange,
      onChangeStart,
      onChangeEnd,
    ],
  )

  const getChannelProps: RequiredUIPropGetter<
    "input",
    Merge<InputProps, { space: Space }>,
    InputProps
  > = useCallback(
    ({ space, ...props }, ref = null) => {
      return {
        required,
        disabled,
        readOnly,
        isInvalid,
        ...props,
        ref,
        type: "number",
        step: 1,
        onChange: handlerAll(props.onChange, (ev) =>
          onChannelChange(ev, space),
        ),
      } as Dict
    },
    [required, disabled, readOnly, isInvalid, onChannelChange],
  )

  const getEyeDropperProps: UIPropGetter<"button"> = useCallback(
    (props = {}, ref = null) => ({
      disabled,
      "aria-label": "Pick a color",
      ...props,
      ref,
      onClick: handlerAll(props.onClick, onEyeDropperClick),
    }),
    [disabled, onEyeDropperClick],
  )

  const getSwatchProps: UIPropGetter<
    "div",
    ColorSwatchProps,
    ColorSwatchProps
  > = useCallback(
    ({ color, ...props } = {}, ref = null) => ({
      "aria-label": `select ${color} as the color`,
      disabled,
      readOnly,
      ...props,
      ref,
      color,
      onClick: handlerAll(props.onClick, () => {
        if (!color) return

        onSwatchClick?.(color)
        onChange(color)
        onChangeEnd(color)
      }),
    }),
    [disabled, readOnly, onSwatchClick, onChange, onChangeEnd],
  )

  return {
    value,
    onChange,
    eyeDropperSupported,
    withAlpha,
    isInteractive,
    disabled,
    readOnly,
    channels,
    getContainerProps,
    getInputProps,
    getSaturationSliderProps,
    getHueSliderProps,
    getAlphaSliderProps,
    getEyeDropperProps,
    getChannelProps,
    getSwatchProps,
  }
}

export type UseColorSelectorReturn = ReturnType<typeof useColorSelector>
