from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload
from src.storage.db import get_session
from src.storage.models import Watchlist, WatchlistItem

router = APIRouter()

# --- Schemas ---
class WatchlistItemOut(BaseModel):
    id: int
    symbol: str
    sort_order: int
    model_config = ConfigDict(from_attributes=True)

class WatchlistOut(BaseModel):
    id: str
    name: str
    items: list[WatchlistItemOut] = []
    model_config = ConfigDict(from_attributes=True)

class WatchlistCreate(BaseModel):
    name: str

class WatchlistUpdate(BaseModel):
    name: str

class WatchlistItemCreate(BaseModel):
    symbol: str

class WatchlistReorder(BaseModel):
    item_ids: list[int]

# --- Endpoints ---

@router.get("", response_model=list[WatchlistOut])
def get_watchlists():
    session = get_session()
    try:
        stmt = select(Watchlist).options(selectinload(Watchlist.items)).order_by(Watchlist.created_at.asc())
        watchlists = session.execute(stmt).scalars().all()
        return [WatchlistOut.model_validate(w) for w in watchlists]
    finally:
        session.close()

@router.post("", response_model=WatchlistOut)
def create_watchlist(data: WatchlistCreate):
    session = get_session()
    try:
        w = Watchlist(name=data.name)
        session.add(w)
        session.commit()
        session.refresh(w)
        return WatchlistOut(id=w.id, name=w.name, items=[])
    finally:
        session.close()

@router.put("/{watchlist_id}", response_model=WatchlistOut)
def update_watchlist(watchlist_id: str, data: WatchlistUpdate):
    session = get_session()
    try:
        w = session.execute(
            select(Watchlist)
            .options(selectinload(Watchlist.items))
            .where(Watchlist.id == watchlist_id)
        ).scalar_one_or_none()
        
        if not w:
            raise HTTPException(status_code=404, detail="Watchlist not found")
            
        w.name = data.name
        session.commit()
        session.refresh(w)
        return WatchlistOut.model_validate(w)
    finally:
        session.close()

@router.delete("/{watchlist_id}")
def delete_watchlist(watchlist_id: str):
    session = get_session()
    try:
        w = session.execute(select(Watchlist).where(Watchlist.id == watchlist_id)).scalar_one_or_none()
        if not w:
            raise HTTPException(status_code=404, detail="Watchlist not found")
        session.delete(w)
        session.commit()
        return {"status": "OK"}
    finally:
        session.close()

@router.post("/{watchlist_id}/items", response_model=WatchlistItemOut)
def add_item(watchlist_id: str, data: WatchlistItemCreate):
    session = get_session()
    try:
        w = session.execute(
            select(Watchlist)
            .options(selectinload(Watchlist.items))
            .where(Watchlist.id == watchlist_id)
        ).scalar_one_or_none()
        
        if not w:
            raise HTTPException(status_code=404, detail="Watchlist not found")
        
        current_max = max([i.sort_order for i in w.items] + [-1])
        
        item = WatchlistItem(watchlist_id=watchlist_id, symbol=data.symbol.upper(), sort_order=current_max + 1)
        session.add(item)
        session.commit()
        session.refresh(item)
        
        return WatchlistItemOut.model_validate(item)
    finally:
        session.close()

@router.delete("/{watchlist_id}/items/{item_id}")
def remove_item(watchlist_id: str, item_id: int):
    session = get_session()
    try:
        item = session.execute(select(WatchlistItem).where(WatchlistItem.id == item_id, WatchlistItem.watchlist_id == watchlist_id)).scalar_one_or_none()
        if not item:
            raise HTTPException(status_code=404, detail="Item not found")
        session.delete(item)
        session.commit()
        return {"status": "OK"}
    finally:
        session.close()

@router.put("/{watchlist_id}/items/reorder")
def reorder_items(watchlist_id: str, data: WatchlistReorder):
    session = get_session()
    try:
        w = session.execute(
            select(Watchlist)
            .options(selectinload(Watchlist.items))
            .where(Watchlist.id == watchlist_id)
        ).scalar_one_or_none()
        
        if not w:
            raise HTTPException(status_code=404, detail="Watchlist not found")
        
        item_map = {item.id: item for item in w.items}
        for index, item_id in enumerate(data.item_ids):
            if item_id in item_map:
                item_map[item_id].sort_order = index
                
        session.commit()
        return {"status": "OK"}
    finally:
        session.close()