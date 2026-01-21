[![npm (scoped)](https://img.shields.io/npm/v/@xstd/flow.svg)](https://www.npmjs.com/package/@xstd/flow)
![npm](https://img.shields.io/npm/dm/@xstd/flow.svg)
![NPM](https://img.shields.io/npm/l/@xstd/flow.svg)
![npm type definitions](https://img.shields.io/npm/types/@xstd/flow.svg)
![coverage](https://img.shields.io/badge/coverage-100%25-green)

<picture>
  <source height="64" media="(prefers-color-scheme: dark)" srcset="https://github.com/xstd-js/website/blob/main/assets/logo/png/logo-large-dark.png?raw=true">
  <source height="64" media="(prefers-color-scheme: light)" srcset="https://github.com/xstd-js/website/blob/main/assets/logo/png/logo-large-light.png?raw=true">
  <img height="64" alt="Shows a black logo in light color mode and a white one in dark color mode." src="https://github.com/xstd-js/website/blob/main/assets/logo/png/logo-large-light.png?raw=true">
</picture>

## @xstd/flow

`Flow` empowers `AsyncGenerator`s to provide a **great streaming experience**.

The goal is to identify what matters most to design a robust stream implementation while keeping the API as simple as possible.

To understand this necessity, please refer to the [MANIFEST](./MANIFEST.md).

### Examples:

#### Automation

Flow is great for automation:

```ts
async function automation(signal: AbortSignal) {
  // Let's assume we have:
  const temperatureObserver: Flow<number> = /*...*/; // emits the temperature of a device
  const airCoolingOnOffWriter: Drain<boolean> = /*...*/; // turns on/off an air cooling device
  
  
  // Then we can link them like this:
  
  // 3) the airCoolingOnOffWriter consumes the created flow and turns on/off the air cooling device acoording to the received temperature values
  await airCoolingOnOffWriter.drain(
    temperatureObserver
      // 1) for each temperature values sent by the temperatureObserver, we return true isf it exceeds 28 degrees
      .map((temperature: number) => temperature > 28.0)
      // 2) we emit only disctinct values, to prevent the air cooling device to be spammed with identical commands
      .distinct(),
    signal,
  );
}
```

#### Drag event

```ts
interface Drag {
  readonly originX: number;
  readonly originY: number;
  readonly currentX: number;
  readonly currentY: number;
  readonly deltaX: number;
  readonly deltaY: number;
}

async function main(signal: AbortSignal) {
  const readable = Flow.when<PointerEvent>(window, 'pointerdown')
    .flatMap((event: PointerEvent): Flow<Drag> => {
      const originX: number = event.clientX;
      const originY: number = event.clientY;

      return (
        Flow.when<PointerEvent>(window, 'pointermove')
          .takeUntil(Flow.when(window, 'pointerup'))
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
          })
      );
    });
  
  for await (const value of readable.open(signal)) {
    console.log('drag', value);
  }
}
```

## 📦 Installation

```shell
yarn add @xstd/flow
# or
npm install @xstd/flow --save
```

## 📜 Documentation

https://xstd-js.github.io/flow

