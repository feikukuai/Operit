'use strict';

const result = await toolCall('package_proxy', {
  tool_name: 'qqbot:qqbot_service_start',
  params: JSON.stringify({
    restart: true,
    timeout_ms: 12000
  })
});

complete(result);
