from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from .models import Farm, TreeInventoryMovement, TreePlanting, TreeType


@transaction.atomic
def record_tree_movement(*, profile, farm: Farm, tree_type: TreeType, action: str,
                         quantity: int, effective_date=None, notes: str = "") -> TreeInventoryMovement:
    """Append a movement and update the current balance atomically."""
    if farm.profile_id != profile.pk or tree_type.profile_id != profile.pk:
        raise ValidationError("Farm and tree type must belong to the current workspace.")
    if action not in {TreeInventoryMovement.ADD, TreeInventoryMovement.REMOVE}:
        raise ValidationError("Choose whether to add or remove trees.")
    if quantity is None or quantity <= 0:
        raise ValidationError("Movement quantity must be greater than zero.")
    effective_date = effective_date or timezone.localdate()
    planting = (TreePlanting.objects.select_for_update()
                .filter(profile=profile, farm=farm, tree_type=tree_type).first())
    if planting is None:
        if action == TreeInventoryMovement.REMOVE:
            raise ValidationError("There are no trees of this type on the selected farm.")
        planting = TreePlanting.objects.create(profile=profile, farm=farm, tree_type=tree_type, count=0)
    if action == TreeInventoryMovement.REMOVE and quantity > planting.count:
        raise ValidationError(f"Cannot remove {quantity} trees; only {planting.count} remain.")
    planting.count += quantity if action == TreeInventoryMovement.ADD else -quantity
    planting.save(update_fields=["count", "updated_at"])
    movement = TreeInventoryMovement(profile=profile, planting=planting, action=action,
                                     quantity=quantity, effective_date=effective_date, notes=notes or "")
    movement.full_clean()
    movement.save()
    return movement
