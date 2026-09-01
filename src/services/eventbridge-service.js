import { eventBridgeRequest } from '../lib/localstack.js';

export async function listEventBuses() {
  const buses = [];
  let nextToken;
  do {
    const result = await eventBridgeRequest('ListEventBuses', nextToken ? { NextToken: nextToken } : {});
    buses.push(...(result.EventBuses || []));
    nextToken = result.NextToken;
  } while (nextToken);
  return buses.map((bus) => ({ name: bus.Name, arn: bus.Arn }));
}

export async function listRules(eventBusName) {
  const rules = [];
  let nextToken;
  do {
    const result = await eventBridgeRequest('ListRules', {
      EventBusName: eventBusName,
      ...(nextToken ? { NextToken: nextToken } : {}),
    });
    rules.push(...(result.Rules || []));
    nextToken = result.NextToken;
  } while (nextToken);

  return Promise.all(
    rules.map(async (rule) => {
      const result = await eventBridgeRequest('ListTargetsByRule', {
        EventBusName: eventBusName,
        Rule: rule.Name,
      });
      return {
        name: rule.Name,
        arn: rule.Arn,
        description: rule.Description || '',
        state: rule.State,
        eventPattern: rule.EventPattern ? JSON.parse(rule.EventPattern) : null,
        scheduleExpression: rule.ScheduleExpression || null,
        targets: (result.Targets || []).map((target) => ({
          id: target.Id,
          arn: target.Arn,
          input: target.Input || null,
          inputPath: target.InputPath || null,
        })),
      };
    }),
  );
}

export async function putEvent(eventBusName, event) {
  const result = await eventBridgeRequest('PutEvents', {
    Entries: [{
      EventBusName: eventBusName,
      Source: event.source,
      DetailType: event.detailType,
      Detail: JSON.stringify(event.detail),
      ...(event.resources?.length ? { Resources: event.resources } : {}),
    }],
  });
  const entry = result.Entries?.[0] || {};
  if (entry.ErrorCode) throw new Error(`${entry.ErrorCode}: ${entry.ErrorMessage || 'Event was rejected'}`);
  return { eventId: entry.EventId, failedEntryCount: result.FailedEntryCount || 0 };
}
