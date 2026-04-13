<script setup lang="ts">
import { computed, ref, watch, type CSSProperties } from 'vue';
import { PDF_FORM_FIELD_FLAG, standardFontCssProperties } from '@embedpdf/models';
import type { TextFieldProps } from '../../../shared/components/types';
import { inputStyle, textareaStyle } from './style';
import { useIOSZoomPrevention } from '@embedpdf/plugin-annotation/vue';

const props = defineProps<TextFieldProps>();

const field = computed(() => props.annotation.field);
const flag = computed(() => field.value.flag);
const name = computed(() => field.value.name);
const value = computed(() => field.value.value);

const localValue = ref(value.value);

watch(value, (v) => {
  if (!props.syncExternalValue) return;
  localValue.value = v;
});

function changeValue(evt: Event) {
  const newValue = (evt.target as HTMLInputElement).value;
  localValue.value = newValue;
  props.onChangeField?.({ ...field.value, value: newValue });
}

const bw = computed(() => (props.annotation.strokeWidth ?? 0) * props.scale);
const fontCss = computed(() => standardFontCssProperties(props.annotation.fontFamily));
const computedFontPx = computed(() => props.annotation.fontSize * props.scale);

const iosCompensation = useIOSZoomPrevention(computedFontPx, true);

const visualStyle = computed<CSSProperties>(() => ({
  backgroundColor: props.annotation.color ?? 'transparent',
  borderStyle: 'solid',
  borderColor: props.annotation.strokeColor ?? 'transparent',
  borderWidth: `${bw.value}px`,
  color: props.annotation.fontColor,
  ...fontCss.value,
  fontSize: `${iosCompensation.value.adjustedFontPx}px`,
  padding: `${bw.value}px ${bw.value}px`,
}));

const isDisabled = computed(
  () => !props.isEditable || !!(flag.value & PDF_FORM_FIELD_FLAG.READONLY),
);
const isRequired = computed(() => !!(flag.value & PDF_FORM_FIELD_FLAG.REQUIRED));
const isPassword = computed(() => !!(flag.value & PDF_FORM_FIELD_FLAG.TEXT_PASSWORD));
const isMultipleLine = computed(() => !!(flag.value & PDF_FORM_FIELD_FLAG.TEXT_MULTIPLINE));
const isComb = computed(() => !!(flag.value & PDF_FORM_FIELD_FLAG.TEXT_COMB));
const maxLen = computed(() => field.value.maxLen);

const cellWidth = computed(() =>
  isComb.value && maxLen.value
    ? (props.annotation.rect.size.width * props.scale) / maxLen.value
    : 0,
);
const chars = computed(() => (localValue.value || '').split(''));
const caretIndex = computed(() => chars.value.length);

const caretVisible = ref(true);
let caretInterval: ReturnType<typeof setInterval> | undefined;

watch(
  caretIndex,
  () => {
    caretVisible.value = true;
    clearInterval(caretInterval);
    caretInterval = setInterval(() => {
      caretVisible.value = !caretVisible.value;
    }, 530);
  },
  { immediate: true },
);

const combContainerStyle = computed<CSSProperties>(() => ({
  position: 'relative',
  width: '100%',
  height: '100%',
  borderRadius: 0,
  boxSizing: 'border-box',
  backgroundColor: props.annotation.color ?? 'transparent',
  borderStyle: 'solid',
  borderColor: props.annotation.strokeColor ?? 'transparent',
  borderWidth: `${bw.value}px`,
}));

const cellFontStyle = computed<CSSProperties>(() => ({
  color: props.annotation.fontColor,
  ...fontCss.value,
  fontSize: `${iosCompensation.value.adjustedFontPx}px`,
}));

function setInputRef(el: any) {
  props.inputRef?.(el as HTMLElement | null);
}
</script>

<template>
  <template v-if="isComb && maxLen">
    <div v-if="iosCompensation.wrapperStyle" :style="iosCompensation.wrapperStyle">
      <div :style="combContainerStyle">
        <input
          :ref="setInputRef"
          :required="isRequired"
          :disabled="isDisabled"
          :type="isPassword ? 'password' : 'text'"
          :name="name"
          :aria-label="name"
          :value="localValue"
          :maxlength="maxLen"
          @focus="props.onFocus?.()"
          @input="changeValue"
          @blur="props.onBlur?.()"
          :style="{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            opacity: 0,
            padding: 0,
            margin: 0,
            border: 'none',
            zIndex: 1,
          }"
        />
        <span
          v-for="(_, i) in Array.from({ length: maxLen })"
          :key="i"
          :style="{
            ...cellFontStyle,
            position: 'absolute',
            top: 0,
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
            left: `${i * cellWidth}px`,
            width: `${cellWidth}px`,
          }"
          >{{ chars[i] || '' }}</span
        >
        <span
          v-if="caretIndex < maxLen"
          :style="{
            position: 'absolute',
            top: '15%',
            height: '70%',
            width: '1px',
            backgroundColor: 'black',
            pointerEvents: 'none',
            left: `${caretIndex * cellWidth + cellWidth / 2}px`,
            opacity: caretVisible ? 1 : 0,
          }"
        ></span>
      </div>
    </div>
    <div v-else :style="combContainerStyle">
      <input
        :ref="setInputRef"
        :required="isRequired"
        :disabled="isDisabled"
        :type="isPassword ? 'password' : 'text'"
        :name="name"
        :aria-label="name"
        :value="localValue"
        :maxlength="maxLen"
        @focus="props.onFocus?.()"
        @input="changeValue"
        @blur="props.onBlur?.()"
        :style="{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          opacity: 0,
          padding: 0,
          margin: 0,
          border: 'none',
          zIndex: 1,
        }"
      />
      <span
        v-for="(_, i) in Array.from({ length: maxLen })"
        :key="i"
        :style="{
          ...cellFontStyle,
          position: 'absolute',
          top: 0,
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'none',
          left: `${i * cellWidth}px`,
          width: `${cellWidth}px`,
        }"
        >{{ chars[i] || '' }}</span
      >
      <span
        v-if="caretIndex < maxLen"
        :style="{
          position: 'absolute',
          top: '15%',
          height: '70%',
          width: '1px',
          backgroundColor: 'black',
          pointerEvents: 'none',
          left: `${caretIndex * cellWidth + cellWidth / 2}px`,
          opacity: caretVisible ? 1 : 0,
        }"
      ></span>
    </div>
  </template>
  <template v-else-if="isMultipleLine">
    <div v-if="iosCompensation.wrapperStyle" :style="iosCompensation.wrapperStyle">
      <textarea
        :ref="setInputRef"
        :required="isRequired"
        :disabled="isDisabled"
        :name="name"
        :aria-label="name"
        :value="localValue"
        :maxlength="maxLen"
        @focus="props.onFocus?.()"
        @input="changeValue"
        @blur="props.onBlur?.()"
        :style="{ ...textareaStyle, ...visualStyle }"
      ></textarea>
    </div>
    <textarea
      v-else
      :ref="setInputRef"
      :required="isRequired"
      :disabled="isDisabled"
      :name="name"
      :aria-label="name"
      :value="localValue"
      :maxlength="maxLen"
      @focus="props.onFocus?.()"
      @input="changeValue"
      @blur="props.onBlur?.()"
      :style="{ ...textareaStyle, ...visualStyle }"
    ></textarea>
  </template>
  <template v-else>
    <div v-if="iosCompensation.wrapperStyle" :style="iosCompensation.wrapperStyle">
      <input
        :ref="setInputRef"
        :required="isRequired"
        :disabled="isDisabled"
        :type="isPassword ? 'password' : 'text'"
        :name="name"
        :aria-label="name"
        :value="localValue"
        :maxlength="maxLen"
        @focus="props.onFocus?.()"
        @input="changeValue"
        @blur="props.onBlur?.()"
        :style="{ ...inputStyle, ...visualStyle }"
      />
    </div>
    <input
      v-else
      :ref="setInputRef"
      :required="isRequired"
      :disabled="isDisabled"
      :type="isPassword ? 'password' : 'text'"
      :name="name"
      :aria-label="name"
      :value="localValue"
      :maxlength="maxLen"
      @focus="props.onFocus?.()"
      @input="changeValue"
      @blur="props.onBlur?.()"
      :style="{ ...inputStyle, ...visualStyle }"
    />
  </template>
</template>
