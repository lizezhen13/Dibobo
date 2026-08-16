import type { UseFormReturn } from "react-hook-form";

import { FormField } from "../../components/patterns";
import { Textarea } from "../../components/ui/textarea";
import { todayInShanghai, type HoldingForm, type StepperField } from "./holding-form-schema";
import { NumberStepper, SingleDateField } from "./holding-form-controls";

export function HoldingFormFields({
  form,
  isClosed,
  isClosing,
  quantityMinimum,
  adjustNumber,
}: {
  form: UseFormReturn<HoldingForm>;
  isClosed: boolean;
  isClosing: boolean;
  quantityMinimum: number;
  adjustNumber: (field: StepperField, direction: 1 | -1, minimum: number, step: number, precision: number) => void;
}) {
  const watchedAverageCost = form.watch("average_cost");
  const watchedQuantity = form.watch("quantity");
  const watchedClosePrice = form.watch("close_price");
  const watchedClosedQuantity = form.watch("closed_quantity");
  const watchedOpenedOn = form.watch("opened_on");
  const watchedClosedOn = form.watch("closed_on");
  const errors = form.formState.errors;

  return (
    <>
      {!isClosed && (
        <>
          <div className="grid grid-cols-2 gap-5">
            <FormField label="平均持仓成本" error={errors.average_cost?.message}>
              <NumberStepper
                min={0}
                step={1}
                value={watchedAverageCost}
                placeholder="0.0000"
                registration={form.register("average_cost")}
                onStep={(direction) => adjustNumber("average_cost", direction, 0, 1, 4)}
                ariaLabel="平均持仓成本"
              />
            </FormField>
            <FormField label="持股数量" error={errors.quantity?.message}>
              <NumberStepper
                min={quantityMinimum}
                step={1}
                value={watchedQuantity}
                placeholder="0"
                registration={form.register("quantity")}
                onStep={(direction) => adjustNumber("quantity", direction, quantityMinimum, 1, 0)}
                ariaLabel="持股数量"
              />
            </FormField>
          </div>
          <FormField label="建仓日期" error={errors.opened_on?.message}>
            <SingleDateField
              value={watchedOpenedOn}
              max={todayInShanghai()}
              placeholder="请选择建仓日期"
              onChange={(value) => form.setValue("opened_on", value, { shouldDirty: true, shouldTouch: true, shouldValidate: true })}
            />
          </FormField>
          {isClosing && (
            <div className="grid grid-cols-2 gap-5 rounded-xl border border-primary/20 bg-primary/[0.05] p-4">
              <FormField label="清仓价格" error={errors.close_price?.message}>
                <NumberStepper
                  min={0.0001}
                  step={1}
                  value={watchedClosePrice}
                  placeholder="请输入实际清仓价格"
                  registration={form.register("close_price")}
                  onStep={(direction) => adjustNumber("close_price", direction, 0.0001, 1, 4)}
                  ariaLabel="清仓价格"
                />
              </FormField>
              <FormField label="清仓日期" error={errors.closed_on?.message}>
                <SingleDateField
                  value={watchedClosedOn}
                  max={todayInShanghai()}
                  placeholder="请选择清仓日期"
                  onChange={(value) => form.setValue("closed_on", value, { shouldDirty: true, shouldTouch: true, shouldValidate: true })}
                />
              </FormField>
            </div>
          )}
        </>
      )}

      {isClosed && (
        <>
          <div className="grid grid-cols-2 gap-5 rounded-xl border border-border bg-card-deep/30 p-4">
            <FormField label="清仓数量" error={errors.closed_quantity?.message}>
              <NumberStepper
                min={1}
                step={1}
                value={watchedClosedQuantity}
                placeholder="历史记录可补录"
                registration={form.register("closed_quantity")}
                onStep={(direction) => adjustNumber("closed_quantity", direction, 1, 1, 0)}
                ariaLabel="清仓数量"
              />
            </FormField>
            <FormField label="清仓价格" error={errors.close_price?.message}>
              <NumberStepper
                min={0.0001}
                step={1}
                value={watchedClosePrice}
                placeholder="历史记录可补录"
                registration={form.register("close_price")}
                onStep={(direction) => adjustNumber("close_price", direction, 0.0001, 1, 4)}
                ariaLabel="清仓价格"
              />
            </FormField>
          </div>
          <FormField label="清仓日期" error={errors.closed_on?.message}>
            <SingleDateField
              value={watchedClosedOn}
              max={todayInShanghai()}
              placeholder="请选择清仓日期"
              onChange={(value) => form.setValue("closed_on", value, { shouldDirty: true, shouldTouch: true, shouldValidate: true })}
            />
          </FormField>
        </>
      )}

      <FormField label="备注" error={errors.note?.message} hint={`${form.watch("note").length}/1000`}>
        <Textarea className="min-h-24" placeholder="记录建仓逻辑、计划或需要复盘的事项（可选）" {...form.register("note")} />
      </FormField>
    </>
  );
}
