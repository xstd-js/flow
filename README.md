[![npm (scoped)](https://img.shields.io/npm/v/@xstd/flow.svg)](https://www.npmjs.com/package/@xstd/flow)
![npm](https://img.shields.io/npm/dm/@xstd/flow.svg)
![NPM](https://img.shields.io/npm/l/@xstd/flow.svg)
![npm type definitions](https://img.shields.io/npm/types/@xstd/flow.svg)

[//]: # (![coverage]&#40;https://img.shields.io/badge/coverage-100%25-green&#41;)

<picture>
  <source height="64" media="(prefers-color-scheme: dark)" srcset="https://github.com/xstd-js/website/blob/main/assets/logo/png/logo-large-dark.png?raw=true">
  <source height="64" media="(prefers-color-scheme: light)" srcset="https://github.com/xstd-js/website/blob/main/assets/logo/png/logo-large-light.png?raw=true">
  <img height="64" alt="Shows a black logo in light color mode and a white one in dark color mode." src="https://github.com/xstd-js/website/blob/main/assets/logo/png/logo-large-light.png?raw=true">
</picture>

**WORK IN PROGRESS**

## @xstd/flow

`Flow` is all about **reimagining the stream interface**.

The goal is to identify what matters most in designing a robust stream interface, and to provide implementations that fulfill these requirements.

To understand this necessity, please refer to the [MANIFEST](./MANIFEST.md).

### Examples:

#### Automation

Flow is great for automation:

```ts
async function automation() {
    await using temperatureReader: AsyncReader<number> = await temperatureDevice.open();
    await using airConditioningOnOffWriter: AsyncWriter<boolean> = await airConditioningDevice.open();

  while (true) {
    // if temperature > 28°C, turn on AC
    await airConditioningOnOffWriter.next((await temperatureReader.next()) > 28.0);
  }
}
```

#### Drag event

```ts
import { AsyncReadable } from '@xstd/flow';

interface Drag {
  readonly originX: number;
  readonly originY: number;
  readonly currentX: number;
  readonly currentY: number;
  readonly deltaX: number;
  readonly deltaY: number;
}

async function example() {
  const readable = AsyncReadable.when<PointerEvent>(window, 'pointerdown')
    .flatMap((event: PointerEvent): AsyncReadable<Drag> => {
      const originX: number = event.clientX;
      const originY: number = event.clientY;

      return AsyncReadable.when<PointerEvent>(window, 'pointermove')
        .takeUntil(AsyncReadable.when(window, 'pointerup'))
        .map((event: PointerEvent): Drag => {
          const currentX: number = event.clientX;
          const currentY: number = event.clientY;

          return {
            originX,
            originY,
            currentX,
            currentY,
            deltaX: currentX - originX,
            deltaY: currentY - originY,
          };
        });
    });

  await using reader: AsyncReader<Drag> = await readable.open();
  
  while (true) {
    console.log('drag', await reader.next());
  }
}

example();
```

## 📦 Installation

```shell
yarn add @xstd/flow
# or
npm install @xstd/flow --save
```

## 📜 Documentation

https://xstd-js.github.io/flow

