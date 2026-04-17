"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, MailCheck } from "lucide-react";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { requestMagicLink } from "@/features/auth/actions";

const schema = z.object({
  email: z.email({ message: "Correo inválido" }),
});

type FormValues = z.infer<typeof schema>;

export function LoginForm() {
  const [sent, setSent] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "" },
  });

  function onSubmit(values: FormValues) {
    startTransition(async () => {
      const formData = new FormData();
      formData.append("email", values.email);
      const result = await requestMagicLink(formData);
      if (result.ok) {
        setSent(values.email);
      } else {
        toast.error(result.error);
      }
    });
  }

  if (sent) {
    return (
      <div className="space-y-4 rounded-lg border border-border bg-card p-6 text-center">
        <MailCheck className="mx-auto size-10 text-primary" />
        <div className="space-y-1">
          <p className="font-serif text-xl text-foreground">
            Revisa tu correo
          </p>
          <p className="text-sm text-muted-foreground">
            Te enviamos un enlace a{" "}
            <span className="font-medium text-foreground">{sent}</span> para
            entrar.
          </p>
        </div>
        <Button
          variant="ghost"
          className="w-full"
          onClick={() => {
            setSent(null);
            form.reset();
          }}
        >
          Usar otro correo
        </Button>
      </div>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Correo</FormLabel>
              <FormControl>
                <Input
                  type="email"
                  autoComplete="email"
                  placeholder="tu@correo.com"
                  className="h-12 text-base"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button
          type="submit"
          size="lg"
          className="w-full"
          disabled={pending}
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : null}
          Enviar enlace
        </Button>
      </form>
    </Form>
  );
}
