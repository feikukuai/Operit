'use strict';

const result = await toolCall('package_proxy', {
  tool_name: 'qqbot:qqbot_status',
  params: JSON.stringify({})
});

complete(result);
