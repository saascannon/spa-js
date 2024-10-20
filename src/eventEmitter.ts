type EventHandler = (data?: any) => void;

class EventEmitter<Event = string> {
  private handlers: Map<Event, EventHandler> = new Map();

  public on(eventName: Event, handler: EventHandler) {
    this.handlers.set(eventName, handler);
    return this;
  }

  protected triggerEvent(eventName: Event, data?: any) {
    const handler = this.handlers.get(eventName);

    if (!handler) {
      return;
    }

    handler(data);
  }
}

export default EventEmitter;
