# Event System Implementation Guide (이벤트 시스템 가이드)

이 문서는 프로젝트에 적용된 **Type-Safe Event Bus** 패턴을 사용하여 새로운 기능을 추가하는 방법을 설명합니다.

## 1. 이벤트 정의 (Define Event)

`src/main/events/types.ts` 파일을 열어 새로운 이벤트를 정의합니다.

1.  **EventType Enum 추가**: 이벤트의 고유 이름을 정의합니다.
2.  **Interface 정의**: 페이로드(Payload) 구조를 정의합니다.
3.  **AppEvent Union 갱신**: `AppEvent` 타입에 새로운 인터페이스를 추가합니다.

```typescript
// src/main/events/types.ts

// 1. Enum 추가
export enum EventType {
  // ... existing types
  MY_NEW_EVENT = "DOMAIN:MY_EVENT_NAME",
}

// 2. Interface 정의
export interface MyNewEvent {
  type: EventType.MY_NEW_EVENT;
  payload: {
    data: string;
    count: number;
  };
  timestamp?: number;
}

// 3. Union 타입에 추가
export type AppEvent = ConfigChangeEvent | ProcessEvent | MyNewEvent; // <--- 추가
```

---

## 2. 핸들러 구현 (Implement Handler)

`src/main/events/handlers/` 디렉토리에 핸들러 파일을 생성합니다.
`EventHandler<T>` 제네릭을 사용하여 타입 안전성을 확보합니다.

```typescript
// src/main/events/handlers/MyNewHandler.ts

import { AppContext, EventHandler, EventType, MyNewEvent } from "../types";

// Generic <MyNewEvent>를 지정하면 handle 메서드에서 event 타입이 자동 추론됩니다.
export const MyNewHandler: EventHandler<MyNewEvent> = {
  id: "MyNewHandler",
  targetEvent: EventType.MY_NEW_EVENT,

  // [옵션] 실행 조건 (조건이 false면 handle이 실행되지 않음)
  condition: (context: AppContext) => {
    return true;
  },

  handle: async (event, context) => {
    // event.payload는 { data: string, count: number } 로 자동 추론됨!
    console.log("Received:", event.payload.data);

    // context를 통해 창 제어, 설정 접근 등 가능
    if (context.mainWindow) {
      // ...
    }
  },
};
```

---

## 3. 핸들러 등록 (Register Handler)

`src/main/main.ts` (또는 초기화 로직이 있는 곳)에서 핸들러를 등록합니다.

```typescript
// src/main/main.ts

import { MyNewHandler } from "./events/handlers/MyNewHandler";

// ...
function createWindows() {
  // ...
  eventBus.register(StartPoe2KakaoHandler);
  eventBus.register(MyNewHandler); // <--- 등록
  // ...
}
```

---

## 4. 이벤트 발송 (Emit Event)

어디서든 `EventBus`를 통해 이벤트를 발송할 수 있습니다.
반드시 `type`에 맞는 `payload`를 전달해야 컴파일 에러가 나지 않습니다.

```typescript
import { eventBus } from "./events/EventBus";
import { EventType, MyNewEvent } from "./events/types";

// ... logic ...

// Generic을 명시하거나 인자를 통해 추론
eventBus.emit<MyNewEvent>(EventType.MY_NEW_EVENT, context, {
  data: "Hello World",
  count: 123,
});

// ❌ 잘 못 된 예 (컴파일 에러 발생)
// eventBus.emit(EventType.MY_NEW_EVENT, context, { wrong: "data" });
```
