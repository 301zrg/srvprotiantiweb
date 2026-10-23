import { SettingOutlined } from "@ant-design/icons";
import { Button } from "antd";

import { useI18N } from "@/ui/I18N";
import { openSettingPanel } from "@/ui/Setting";
import { mobileMessages } from "@/variant/mobileMessages";

export const RoomSettingsButton = ({
  testId = "waitroom-settings",
}: {
  testId?: string;
}) => {
  const { language } = useI18N();
  return (
    <Button
      data-testid={testId}
      icon={<SettingOutlined />}
      onClick={() => openSettingPanel({ defaultKey: "operations" })}
    >
      {mobileMessages(language).settings}
    </Button>
  );
};
