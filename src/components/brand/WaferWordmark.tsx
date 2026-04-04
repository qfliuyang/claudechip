import { Box, Text } from '../../ink.js';

export interface WaferWordmarkProps {
  active?: boolean;
}

export function WaferWordmark({ active = false }: WaferWordmarkProps) {
  const textColor = active ? 'claude' : 'comment';

  return (
    <Box flexDirection="row">
      <Text color="info">[o.o]</Text>
      <Text color="success">[ooo]</Text>
      <Text color={textColor}> claudechip</Text>
    </Box>
  );
}
