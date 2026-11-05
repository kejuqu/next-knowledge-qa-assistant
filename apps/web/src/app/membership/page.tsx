"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@kqa/ui/components/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@kqa/ui/components/card";
import { Clock, RefreshCw } from "lucide-react";

export default function MembershipPage() {
  const { data, error, refetch, isFetching } = useQuery<{ status: string; tenantName: string }>({
    queryKey: ["membership"],
    queryFn: async () => {
      const response = await fetch("/api/membership");
      if (response.status === 401) {
        window.location.assign("/signin");
        throw new Error("请重新登录");
      }
      if (!response.ok) throw new Error("无法读取加入申请，请联系团队管理员。");
      return response.json();
    },
    refetchInterval: 5000,
  });
  useEffect(() => {
    if (data?.status === "active") window.location.replace("/chat");
  }, [data]);
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <Clock className="mb-3 size-8 text-primary" />
          <CardTitle>{data?.status === "rejected" ? "加入申请未通过" : "等待团队审批"}</CardTitle>
          <CardDescription>{data?.tenantName ? `申请加入：${data.tenantName}` : "正在读取申请状态…"}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{data?.status === "rejected"
            ? "团队管理员未通过你的申请，请联系管理员了解详情。"
            : "已通知团队管理员。审批通过后会自动进入知识库；审批前无法访问团队文档和问答。"}</p>
          {error && <p role="alert" className="mt-3 text-sm text-destructive">{error.message}</p>}
        </CardContent>
        <CardFooter className="flex flex-wrap gap-3">
          <Button variant="outline" disabled={isFetching} onClick={() => void refetch()}><RefreshCw />检查审批状态</Button>
          <form action="/api/signout" method="post"><Button variant="ghost" type="submit">退出登录</Button></form>
        </CardFooter>
      </Card>
    </div>
  );
}
